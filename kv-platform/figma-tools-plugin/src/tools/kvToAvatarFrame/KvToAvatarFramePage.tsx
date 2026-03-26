import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { onPluginMessage, postToPlugin } from '@/figma/bridge';
import { useNavigation } from '@/router';
import { useAvatarFrameSettings } from '@/stores/avatarFrameSettings';
import {
  type AvatarFrameLevel,
  avatarFrameLevelIncludesTop,
  buildAvatarFrameSpecForLevel,
  buildMockSpecBoxesForLevel,
  getWriteBoxesForLevel,
} from '@/tools/kvToAvatarFrame/avatarFrameLevelLayout';
import { generateAvatarFrameMock } from '@/tools/kvToAvatarFrame/mockGenerate';

type NodeMeta = {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
};

type GenResult = {
  element1DataUrl: string;
  element2DataUrl: string;
  element3DataUrl: string;
  /** 服务端合成预览；可能为空 */
  compositeDataUrl?: string;
};

function bytesToDataUrl(bytes: Uint8Array, contentType: string) {
  const len = bytes.byteLength;
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function dataUrlToBytes(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m?.[2]) throw new Error('invalid_dataUrl');
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_blob_failed'));
    reader.readAsDataURL(blob);
  });
}

async function ensureDataUrl(src: string) {
  if (src.startsWith('data:image/')) return src;
  const res = await fetch(src, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch_image_${res.status}`);
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

async function trimTransparentBounds(inputSrc: string, alphaThreshold = 1) {
  const dataUrl = await ensureDataUrl(inputSrc);
  const img = new Image();
  const imgLoaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('load_image_failed'));
  });
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await imgLoaded;

  const w = Math.max(1, Math.floor(img.width));
  const h = Math.max(1, Math.floor(img.height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = data[(y * w + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return dataUrl;
  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('canvas_not_supported');
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}

async function removeNearBlackBackgroundToTransparent(inputSrc: string, threshold = 10) {
  const dataUrl = await ensureDataUrl(inputSrc);
  const img = new Image();
  const imgLoaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('load_image_failed'));
  });
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await imgLoaded;

  const w = Math.max(1, Math.floor(img.width));
  const h = Math.max(1, Math.floor(img.height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= threshold && g <= threshold && b <= threshold) data[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function joinUrl(baseUrl: string, path: string) {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

const FIGMA_FRAME_PREVIEW = 270;

async function loadImageForPreview(src: string): Promise<HTMLImageElement> {
  const url = await ensureDataUrl(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('preview_load_failed'));
    img.src = url;
  });
}

/** 与 Figma 回写同一套框位：270×270，层级 环绕→主→顶（仅 L 有顶） */
async function composeFigmaFramePreview270(
  level: AvatarFrameLevel,
  element1DataUrl: string,
  element2DataUrl: string,
  element3DataUrl: string
): Promise<string> {
  const wb = getWriteBoxesForLevel(level);
  const canvas = document.createElement('canvas');
  canvas.width = FIGMA_FRAME_PREVIEW;
  canvas.height = FIGMA_FRAME_PREVIEW;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, FIGMA_FRAME_PREVIEW, FIGMA_FRAME_PREVIEW);

  const [i1, i2, i3] = await Promise.all([
    loadImageForPreview(element1DataUrl),
    loadImageForPreview(element2DataUrl),
    loadImageForPreview(element3DataUrl),
  ]);

  const draw = (img: HTMLImageElement, box: { x: number; y: number; width: number; height: number }) => {
    if (box.width < 1 || box.height < 1) return;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, box.x, box.y, box.width, box.height);
  };

  draw(i2, wb.element2);
  draw(i1, wb.element1);
  if (wb.element3) {
    draw(i3, wb.element3);
  }

  return canvas.toDataURL('image/png');
}

function parseGenResponse(data: unknown): GenResult {
  const d = asRecord(data);
  const root = asRecord(d?.result) ?? d;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = root?.[k];
      if (typeof v === 'string' && v.startsWith('data:image/')) return v;
      if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) return v;
      const vr = asRecord(v);
      if (typeof vr?.dataUrl === 'string') return String(vr.dataUrl);
      if (typeof vr?.url === 'string') return String(vr.url);
    }
    return '';
  };
  const element1 = get('element1DataUrl', 'element1', 'layer1', 'main');
  const element2 = get('element2DataUrl', 'element2', 'layer2', 'ring');
  const element3 = get('element3DataUrl', 'element3', 'layer3', 'top');
  const composite = get('compositeDataUrl', 'composite', 'merged', 'preview');
  if (!element1 || !element2 || !element3) throw new Error('invalid_generate_response');
  return {
    element1DataUrl: element1,
    element2DataUrl: element2,
    element3DataUrl: element3,
    ...(composite ? { compositeDataUrl: composite } : {}),
  };
}

type UiState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'generating' }
  | { status: 'writing' }
  | { status: 'success'; frameNodeId: string }
  | { status: 'error'; message: string };

export function KvToAvatarFramePage() {
  const { navigate } = useNavigation();
  const { mode, baseUrl, token, generatePath, setMode, setBaseUrl, setToken, setGeneratePath } = useAvatarFrameSettings();
  const [frameLevel, setFrameLevel] = useState<AvatarFrameLevel>('L');
  const [state, setState] = useState<UiState>({ status: 'idle' });
  const [kvMeta, setKvMeta] = useState<NodeMeta | null>(null);
  const [kvPngDataUrl, setKvPngDataUrl] = useState<string | null>(null);
  const [kvJsonText, setKvJsonText] = useState<string>('');
  const [result, setResult] = useState<GenResult | null>(null);
  /** 按当前档位框位在 270 画布上合成，与回写 Frame 一致 */
  const [framePreviewUrl, setFramePreviewUrl] = useState<string | null>(null);
  const [framePreviewBusy, setFramePreviewBusy] = useState(false);
  const kvJsonRef = useRef<unknown>(null);

  const canRun = state.status === 'idle' || state.status === 'success' || state.status === 'error';

  useEffect(() => {
    if (!result) {
      setFramePreviewUrl(null);
      setFramePreviewBusy(false);
      return;
    }
    let cancelled = false;
    setFramePreviewBusy(true);
    composeFigmaFramePreview270(
      frameLevel,
      result.element1DataUrl,
      result.element2DataUrl,
      result.element3DataUrl
    )
      .then((url) => {
        if (!cancelled) setFramePreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFramePreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setFramePreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [result, frameLevel]);

  useEffect(() => {
    return onPluginMessage((msg) => {
      if (msg.type === 'KV_EXPORT_ERROR') {
        setState({ status: 'error', message: msg.message });
        return;
      }
      if (msg.type === 'KV_EXPORT_RESULT') {
        setKvMeta(msg.node);
        setKvPngDataUrl(bytesToDataUrl(msg.bytes, 'image/png'));
        kvJsonRef.current = msg.kv;
        setKvJsonText(JSON.stringify(msg.kv, null, 2));
        setState({ status: 'idle' });
        return;
      }
      if (msg.type === 'WRITE_AVATARFRAME_DONE') {
        setState({ status: 'success', frameNodeId: msg.frameNodeId });
        return;
      }
      if (msg.type === 'WRITE_AVATARFRAME_ERROR') {
        setState({ status: 'error', message: msg.message });
        return;
      }
    });
  }, []);

  const selectionLabel = useMemo(() => {
    if (!kvMeta) return '未读取';
    const dims = `${Math.round(kvMeta.width)}×${Math.round(kvMeta.height)}`;
    return `${kvMeta.pageName} / ${kvMeta.name} (${dims})`;
  }, [kvMeta]);

  const refreshSelection = () => {
    setState({ status: 'exporting' });
    postToPlugin({ type: 'EXPORT_KV_FROM_SELECTION', scale: 2 });
  };

  const runGenerate = async () => {
    try {
      const kvDataUrl = kvPngDataUrl;
      if (!kvDataUrl) {
        setState({ status: 'error', message: '请先读取选区并导出 KV' });
        return;
      }

      setState({ status: 'generating' });

      const specPayload = buildAvatarFrameSpecForLevel(frameLevel);

      if (mode === 'mock') {
        const mockSpec = buildMockSpecBoxesForLevel(frameLevel);
        const mock = await generateAvatarFrameMock({
          figmaFrame: mockSpec.figmaFrame,
          targetFrame: mockSpec.targetFrame,
          boxes: mockSpec.boxes,
        });
        // 本地模拟图已是透明底示意，不再做去黑边/裁剪，避免把占位色抠坏
        setResult(mock);
        setState({ status: 'idle' });
        return;
      }

      if (!baseUrl.trim() || !generatePath.trim()) {
        throw new Error('请填写 Base URL 与生成 Path');
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const t = token.trim();
      if (t) headers['Authorization'] = t.startsWith('Bearer ') ? t : `Bearer ${t}`;

      const url = joinUrl(baseUrl, generatePath);
      const payload = {
        kvPngDataUrl: kvDataUrl,
        kvJson: kvJsonRef.current,
        prompts: {},
        spec: specPayload,
      };

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errCode = typeof data?.error === 'string' ? data.error : '';
        if (errCode === 'ark_i2i_not_configured') {
          throw new Error(
            '真实 AI 未配置：请在 ai-design-platform 的 .env 中设置 ARK_API_KEY + ARK_MODEL（或 ARK_I2I_* / ARK_IMAGE_*），再重试。'
          );
        }
        throw new Error(errCode || `生成失败（HTTP ${res.status}）`);
      }
      const parsed = parseGenResponse(data as unknown);

      const [e1, e2, e3] = await Promise.all([
        removeNearBlackBackgroundToTransparent(parsed.element1DataUrl, 10).then((v) => trimTransparentBounds(v)),
        removeNearBlackBackgroundToTransparent(parsed.element2DataUrl, 10).then((v) => trimTransparentBounds(v)),
        removeNearBlackBackgroundToTransparent(parsed.element3DataUrl, 10).then((v) => trimTransparentBounds(v)),
      ]);

      setResult({
        element1DataUrl: e1,
        element2DataUrl: e2,
        element3DataUrl: e3,
        ...(parsed.compositeDataUrl ? { compositeDataUrl: parsed.compositeDataUrl } : {}),
      });
      setState({ status: 'idle' });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const message = /fetch failed|failed to fetch/i.test(raw)
        ? '网络请求失败：请重新导入插件（更新网络白名单），并在 ai-design-platform 目录执行 npm run dev:avatar-frame-api（默认 http://localhost:3004）'
        : /rmbg_local/i.test(raw)
          ? '抠图服务不可用：请在仓库根目录启动 rmbg-local-server（默认 http://127.0.0.1:8765），或在本机设置 RMBG_LOCAL_URL 指向可访问的 /cutout；调试可设 AVATARFRAME_CUTOUT=0 跳过抠图。'
          : raw;
      setState({ status: 'error', message });
    }
  };

  const writeBack = () => {
    if (!result) {
      setState({ status: 'error', message: '没有可回写的结果' });
      return;
    }
    setState({ status: 'writing' });
    const wb = getWriteBoxesForLevel(frameLevel);
    const images: {
      element1Png: Uint8Array;
      element2Png: Uint8Array;
      element3Png?: Uint8Array;
    } = {
      element1Png: dataUrlToBytes(result.element1DataUrl),
      element2Png: dataUrlToBytes(result.element2DataUrl),
    };
    if (wb.element3 && avatarFrameLevelIncludesTop(frameLevel)) {
      images.element3Png = dataUrlToBytes(result.element3DataUrl);
    }
    postToPlugin({
      type: 'WRITE_AVATARFRAME_TO_CANVAS',
      frameSize: 270,
      anchorNodeId: kvMeta?.id,
      boxes: {
        element1: wb.element1,
        element2: wb.element2,
        ...(wb.element3 ? { element3: wb.element3 } : { element3: null }),
      },
      images,
      names: {
        frame: kvMeta?.name ? `AvatarFrame_${kvMeta.name}` : 'AvatarFrame',
        element1: '主元素',
        element2: '环绕元素',
        element3: '顶部元素',
      },
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/')}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">KV → 头像框（分图层）</div>
          <div className="text-[11px] text-gray-500 truncate">任选可导出图层作 KV（不限比例）；「读取选区」可反复替换当前 KV</div>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={refreshSelection}
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
          >
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="mb-2">
            <label className="text-[11px] text-gray-700 block">
              交付档位（Frame 固定 270×270，主/环绕框位随档位变化；仅 L 含顶部图层）
              <select
                value={frameLevel}
                onChange={(e) => setFrameLevel(e.target.value as AvatarFrameLevel)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="S">S（LV1）</option>
                <option value="M">M（LV2）</option>
                <option value="L">L（LV3–4）</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-900">当前选择</div>
            <button
              type="button"
              onClick={refreshSelection}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
            >
              <RefreshCw size={12} /> 读取选区
            </button>
          </div>
          <div className="mt-2 text-[11px] text-gray-700 break-all">{selectionLabel}</div>
          {kvPngDataUrl ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
              <img src={kvPngDataUrl} alt="kv" className="block w-full h-auto" />
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-4 text-center text-[11px] text-gray-500">
              选中 Frame / 编组 / 形状 / 矢量 / 图片 / 文本等任一层，点击「读取选区」；可再次读取以替换 KV
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">生成服务</div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            <strong>本地模拟</strong>：流程全在插件内完成，无需起服务（占位图，用于对齐 Figma 回写位置）。
            <strong>HTTP</strong>：与接口契约一致的路径 <code className="bg-gray-100 px-1 rounded">POST /api/avatar-frame/generate</code>（类型见 <code className="bg-gray-100 px-1 rounded">ai-design-platform/api/contracts/avatarFrameGenerate.ts</code>）。本机起 <code className="bg-gray-100 px-1 rounded">npm run dev:avatar-frame-api</code>（<strong>3004</strong>）；真 AI 需 Ark 环境变量；三张图默认再经 <code className="bg-gray-100 px-1 rounded">rmbg-local-server</code>（<strong>8765</strong>）抠图。未配 Ark 时接口返回占位图。另可选旧版插件目录 <code className="bg-gray-100 px-1 rounded">npm run dev:avatarframe-api</code>（3010）。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-700">
              模式
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value === 'mock' ? 'mock' : 'http')}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="mock">本地模拟（内置）</option>
                <option value="http">HTTP 服务</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-700">
              生成 Path
              <input
                value={generatePath}
                onChange={(e) => setGeneratePath(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/api/avatar-frame/generate"
                disabled={mode !== 'http'}
              />
            </label>
          </div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Base URL</div>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:3004"
                disabled={mode !== 'http'}
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Bearer token（可选）</div>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Bearer token"
                type="password"
                disabled={mode !== 'http'}
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={runGenerate}
              className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {(state.status === 'exporting' || state.status === 'generating' || state.status === 'writing') ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wand2 size={16} />
              )}
              开始生成
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">预览结果</div>
          {!result ? (
            <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-4 text-center text-[11px] text-gray-500">尚无结果</div>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[11px] text-gray-600 mb-1">
                  交付 Frame 预览（{FIGMA_FRAME_PREVIEW}×{FIGMA_FRAME_PREVIEW}，与 Figma 框位 / 缩放一致；随档位变化）
                </div>
                {framePreviewBusy ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[11px] text-gray-500">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : framePreviewUrl ? (
                  <div
                    className="mx-auto w-full max-w-[270px] rounded-lg border border-gray-300 overflow-hidden shadow-sm"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    }}
                  >
                    <img
                      src={framePreviewUrl}
                      alt="frame preview"
                      width={FIGMA_FRAME_PREVIEW}
                      height={FIGMA_FRAME_PREVIEW}
                      className="block w-full h-auto aspect-square object-fill"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[11px] text-gray-500">无法生成 Frame 预览</div>
                )}
              </div>

              <div className="text-[11px] text-gray-500">分层素材（调试用）</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-2 py-1 text-[11px] text-gray-600 border-b border-gray-200">主元素</div>
                  <img src={result.element1DataUrl} alt="e1" className="block w-full h-auto" />
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-2 py-1 text-[11px] text-gray-600 border-b border-gray-200">环绕元素</div>
                  <img src={result.element2DataUrl} alt="e2" className="block w-full h-auto" />
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-2 py-1 text-[11px] text-gray-600 border-b border-gray-200">
                    顶部元素
                    {!avatarFrameLevelIncludesTop(frameLevel) ? (
                      <span className="text-gray-400">（S/M 不落档，仅预览）</span>
                    ) : null}
                  </div>
                  <img src={result.element3DataUrl} alt="e3" className="block w-full h-auto" />
                </div>
                {result.compositeDataUrl ? (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-2 py-1 text-[11px] text-gray-600 border-b border-gray-200">服务端合成（1024，参考）</div>
                    <img src={result.compositeDataUrl} alt="cmp" className="block w-full h-auto" />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 p-3 text-[11px] text-gray-500">
                    无服务端合成图
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canRun}
                  onClick={writeBack}
                  className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  {state.status === 'writing' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  回写为分图层 Frame
                </button>
              </div>

              {state.status === 'success' ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="text-xs font-semibold text-green-900">回写完成</div>
                  <div className="mt-1 text-[11px] text-green-700 break-all">Frame Node ID：{state.frameNodeId}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-900">KV JSON（调试）</div>
            {kvPngDataUrl ? (
              <a
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
                href={kvPngDataUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={12} /> 打开 KV PNG
              </a>
            ) : null}
          </div>
          <pre className="mt-2 max-h-44 overflow-auto text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-2 whitespace-pre-wrap">{kvJsonText || '未导出'}</pre>
        </div>

        {state.status === 'error' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-900">出错了</div>
            <div className="text-[11px] text-red-700 mt-1 break-all">{state.message}</div>
          </div>
        ) : null}

        {state.status === 'generating' ? (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-900">生成中</div>
            <div className="text-[11px] text-gray-600 mt-1">正在调用生成服务…</div>
          </div>
        ) : null}

        {state.status === 'exporting' ? (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-900">导出中</div>
            <div className="text-[11px] text-gray-600 mt-1">正在从选区导出 KV PNG 与布局…</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
