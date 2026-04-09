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
import {
  type SlotFillsForLevel,
  computeAllLevelSlotFills,
} from '@/tools/kvToAvatarFrame/computeAllLevelSlotFills';
import { AVATAR_FRAME_DEFAULT_PROMPTS } from '@/tools/kvToAvatarFrame/avatarFramePrompts';
import {
  EMBEDDED_AVATAR_FRAME_DEFAULTS,
  type AvatarFrameDefaultsFile,
} from '@/tools/kvToAvatarFrame/embeddedAvatarFrameDefaults';

type NodeMeta = {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
};

type GenResult = {
  /** 抠图后透明底（调试用） */
  element1DataUrl: string;
  element2DataUrl: string;
  element3DataUrl: string;
  /** LV1/LV2/LV3 槽位贴图（同一次生成、按槽位缩放，无额外出图） */
  fillsByLevel: Record<AvatarFrameLevel, SlotFillsForLevel>;
  /** 服务端合成预览；可能为空 */
  compositeDataUrl?: string;
};

const LEVEL_PREVIEW_LABEL: Record<AvatarFrameLevel, string> = {
  S: 'LV1',
  M: 'LV2',
  L: 'LV3',
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

function joinUrl(baseUrl: string, path: string) {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isDefaultsFile(v: unknown): v is AvatarFrameDefaultsFile {
  const o = asRecord(v);
  if (!o || typeof o.defaultGroupId !== 'string') return false;
  if (!Array.isArray(o.groups)) return false;
  return o.groups.every((g) => {
    const gr = asRecord(g);
    return gr && typeof gr.id === 'string' && typeof gr.name === 'string' && gr.elements && typeof gr.elements === 'object';
  });
}

function defaultTemplatesFromGroup(group: AvatarFrameDefaultsFile['groups'][number]) {
  const el = group.elements || {};
  return {
    element1: typeof el.element1?.src === 'string' ? el.element1.src : 'main.png',
    element2: typeof el.element2?.src === 'string' ? el.element2.src : 'surround.png',
    element3: typeof el.element3?.src === 'string' ? el.element3.src : 'top.png',
  };
}

function groupThumbnailUrl(group: AvatarFrameDefaultsFile['groups'][number], assetsRoot: string): string | null {
  const thumb = typeof group.thumbnail === 'string' ? group.thumbnail.trim() : '';
  const root = assetsRoot.trim().replace(/\/+$/, '');
  if (!thumb || !root) return null;
  return joinUrl(root, `avatar-frame-defaults/${thumb.replace(/^\/+/, '')}`);
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

/** 与 Figma 回写同一套框位：270×270，使用已按槽位 fit 的贴图 */
async function composeFigmaFramePreview270(level: AvatarFrameLevel, fills: SlotFillsForLevel): Promise<string> {
  const wb = getWriteBoxesForLevel(level);
  const canvas = document.createElement('canvas');
  canvas.width = FIGMA_FRAME_PREVIEW;
  canvas.height = FIGMA_FRAME_PREVIEW;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, FIGMA_FRAME_PREVIEW, FIGMA_FRAME_PREVIEW);

  const i2 = await loadImageForPreview(fills.element2);
  const i1 = await loadImageForPreview(fills.element1);

  const draw = (img: HTMLImageElement, box: { x: number; y: number; width: number; height: number }) => {
    if (box.width < 1 || box.height < 1) return;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, box.x, box.y, box.width, box.height);
  };

  draw(i2, wb.element2);
  draw(i1, wb.element1);
  if (fills.element3 && wb.element3 && wb.element3.width >= 1 && wb.element3.height >= 1) {
    const i3 = await loadImageForPreview(fills.element3);
    draw(i3, wb.element3);
  }

  return canvas.toDataURL('image/png');
}

type ParsedGenResponse = {
  element1DataUrl: string;
  element2DataUrl: string;
  element3DataUrl: string;
  compositeDataUrl?: string;
};

function parseGenResponse(data: unknown): ParsedGenResponse {
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
  const {
    mode,
    baseUrl,
    assetsBaseUrl,
    token,
    generatePath,
    setMode,
    setBaseUrl,
    setAssetsBaseUrl,
    setToken,
    setGeneratePath,
  } = useAvatarFrameSettings();
  const [state, setState] = useState<UiState>({ status: 'idle' });
  const [kvMeta, setKvMeta] = useState<NodeMeta | null>(null);
  const [kvPngDataUrl, setKvPngDataUrl] = useState<string | null>(null);
  const [kvJsonText, setKvJsonText] = useState<string>('');
  const [result, setResult] = useState<GenResult | null>(null);
  const [framePreviewByLevel, setFramePreviewByLevel] = useState<Partial<Record<AvatarFrameLevel, string>>>({});
  const [framePreviewBusy, setFramePreviewBusy] = useState(false);
  const kvJsonRef = useRef<unknown>(null);
  const [defaultsConfig, setDefaultsConfig] = useState<AvatarFrameDefaultsFile>(EMBEDDED_AVATAR_FRAME_DEFAULTS);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(EMBEDDED_AVATAR_FRAME_DEFAULTS.defaultGroupId);

  const canRun = state.status === 'idle' || state.status === 'success' || state.status === 'error';

  const selectedDefaultGroup = useMemo(() => {
    const g = defaultsConfig.groups.find((x) => x.id === selectedGroupId);
    return g ?? defaultsConfig.groups[0] ?? null;
  }, [defaultsConfig.groups, selectedGroupId]);

  useEffect(() => {
    const ids = new Set(defaultsConfig.groups.map((x) => x.id));
    setSelectedGroupId((prev) => (ids.has(prev) ? prev : defaultsConfig.defaultGroupId));
  }, [defaultsConfig.defaultGroupId, defaultsConfig.groups]);

  useEffect(() => {
    if (mode !== 'http' || !baseUrl.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = joinUrl(baseUrl, '/api/avatar-frame/default-config');
        const res = await fetch(url);
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (cancelled || !isDefaultsFile(data)) return;
        setDefaultsConfig(data);
      } catch {
        // 保留内嵌 defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, baseUrl]);

  useEffect(() => {
    if (!result?.fillsByLevel) {
      setFramePreviewByLevel({});
      setFramePreviewBusy(false);
      return;
    }
    let cancelled = false;
    setFramePreviewBusy(true);
    void (async () => {
      try {
        const levels = ['L', 'M', 'S'] as const;
        const entries = await Promise.all(
          levels.map(async (lv) => {
            const url = await composeFigmaFramePreview270(lv, result.fillsByLevel[lv]);
            return [lv, url] as const;
          })
        );
        if (!cancelled) {
          setFramePreviewByLevel(Object.fromEntries(entries) as Record<AvatarFrameLevel, string>);
        }
      } catch {
        if (!cancelled) setFramePreviewByLevel({});
      } finally {
        if (!cancelled) setFramePreviewBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result]);

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

      const specPayload = buildAvatarFrameSpecForLevel('L');

      if (mode === 'mock') {
        const mockSpec = buildMockSpecBoxesForLevel('L');
        const mock = await generateAvatarFrameMock({
          figmaFrame: mockSpec.figmaFrame,
          targetFrame: mockSpec.targetFrame,
          boxes: mockSpec.boxes,
        });
        const fillsByLevel = await computeAllLevelSlotFills(
          mock.element1DataUrl,
          mock.element2DataUrl,
          mock.element3DataUrl
        );
        setResult({ ...mock, fillsByLevel });
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
      const defaultTemplates = selectedDefaultGroup
        ? defaultTemplatesFromGroup(selectedDefaultGroup)
        : { element1: 'main.png', element2: 'surround.png', element3: 'top.png' };
      const payload = {
        kvPngDataUrl: kvDataUrl,
        kvJson: kvJsonRef.current,
        prompts: { ...AVATAR_FRAME_DEFAULT_PROMPTS },
        defaultTemplates,
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

      // 服务端已抠图并裁透明边，避免二次「去黑底」损伤边缘
      const e1 = parsed.element1DataUrl;
      const e2 = parsed.element2DataUrl;
      const e3 = parsed.element3DataUrl;

      const fillsByLevel = await computeAllLevelSlotFills(e1, e2, e3);
      setResult({
        element1DataUrl: e1,
        element2DataUrl: e2,
        element3DataUrl: e3,
        fillsByLevel,
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

  const writeBack = (level: AvatarFrameLevel) => {
    if (!result?.fillsByLevel?.[level]) {
      setState({ status: 'error', message: '没有可回写的结果' });
      return;
    }
    setState({ status: 'writing' });
    const fills = result.fillsByLevel[level];
    const wb = getWriteBoxesForLevel(level);
    const images: {
      element1Png: Uint8Array;
      element2Png: Uint8Array;
      element3Png?: Uint8Array;
    } = {
      element1Png: dataUrlToBytes(fills.element1),
      element2Png: dataUrlToBytes(fills.element2),
    };
    if (wb.element3 && fills.element3 && avatarFrameLevelIncludesTop(level)) {
      images.element3Png = dataUrlToBytes(fills.element3);
    }
    const tag = LEVEL_PREVIEW_LABEL[level];
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
        frame: kvMeta?.name ? `AvatarFrame_${tag}_${kvMeta.name}` : `AvatarFrame_${tag}`,
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 leading-relaxed">
          <strong>仍看到「交付档位」下拉、或没有「默认元素组」？</strong>
          说明 Figma 加载的是旧版 UI：<code className="mx-0.5 rounded bg-white/80 px-1">dist/</code>
          未重新构建且不入库。请在终端执行{' '}
          <code className="rounded bg-white/80 px-1">
            cd kv-platform/figma-tools-plugin &amp;&amp; npm run build
          </code>
          ，再用本目录的 <code className="rounded bg-white/80 px-1">manifest.json</code> 在 Figma
          里<strong>重新导入</strong>插件。
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">三档槽位（270×270，无下拉）</div>
          <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
            与网页一致：<strong>一次</strong>按 <strong>L 档（含顶部）</strong>走模型；LV1 / LV2 / LV3 的框位贴图在本地<strong>并行</strong>算好，预览区与三个「回写」按钮始终为三列。
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                { lv: 'S' as const, title: 'LV1', sub: '主+环绕（小框），无顶饰' },
                { lv: 'M' as const, title: 'LV2', sub: '主+环绕（中框），无顶饰' },
                { lv: 'L' as const, title: 'LV3', sub: '主+环绕+顶饰（与出图 spec 一致）' },
              ] as const
            ).map((row) => (
              <div
                key={row.lv}
                className="rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-2 text-center min-w-0"
              >
                <div className="text-[11px] font-bold text-gray-900">{row.title}</div>
                <div className="mt-1 text-[10px] text-gray-600 leading-snug">{row.sub}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
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
          <div className="text-xs font-semibold text-gray-900">
            默认元素组（共 {defaultsConfig.groups.length} 组，全部展示）
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            与 <code className="bg-gray-100 px-1 rounded">defaults.json</code> 一致；HTTP 会拉取{' '}
            <code className="bg-gray-100 px-1 rounded">GET …/default-config</code>。宽屏下一行 5 张正方形缩略图（完整显示、不裁切）。缩略图需填「素材静态根」并起{' '}
            <code className="bg-gray-100 px-1 rounded">banner-expand-tool</code> 的 dev（默认 5173）。
          </p>
          <div className="mt-2">
            <div className="text-[11px] text-gray-600 mb-1">素材静态根（缩略图，可选）</div>
            <input
              value={assetsBaseUrl}
              onChange={(e) => setAssetsBaseUrl(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://localhost:5173"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {defaultsConfig.groups.map((g, idx) => {
              const on = g.id === selectedGroupId;
              const tpl = defaultTemplatesFromGroup(g);
              const thumbSrc = groupThumbnailUrl(g, assetsBaseUrl);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`min-w-0 rounded-lg border p-1.5 text-left transition ${
                    on ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="relative aspect-square w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100"
                    aria-hidden
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        className="h-full w-full object-contain object-center"
                        loading="lazy"
                      />
                    ) : (
                      <>
                        <div
                          className="aspect-square h-full w-full"
                          style={{
                            background:
                              'radial-gradient(circle at 20% 75%, rgba(59,130,246,0.35) 0%, transparent 45%), radial-gradient(circle at 78% 20%, rgba(168,85,247,0.35) 0%, transparent 45%), linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%)',
                          }}
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-500">
                          组 {idx + 1}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-gray-900 truncate">{g.name}</div>
                    {on ? <span className="shrink-0 text-[10px] text-blue-700">当前</span> : null}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-500 leading-snug break-all">
                    {tpl.element1} · {tpl.element2} · {tpl.element3}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">生成服务</div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            <strong>本地模拟</strong>：流程全在插件内完成，无需起服务（占位图，用于对齐 Figma 回写位置）。
            <strong>HTTP</strong>：与接口契约一致的路径 <code className="bg-gray-100 px-1 rounded">POST /api/avatar-frame/generate</code>（类型见 <code className="bg-gray-100 px-1 rounded">ai-design-platform/api/contracts/avatarFrameGenerate.ts</code>）。本机起 <code className="bg-gray-100 px-1 rounded">npm run dev:avatar-frame-api</code>（<strong>3004</strong>）；真 AI 需 Ark 环境变量；三张图默认再经 <code className="bg-gray-100 px-1 rounded">rmbg-local-server</code>（<strong>8765</strong>）抠图。未配 Ark 时接口返回占位图。另可选旧版插件目录 <code className="bg-gray-100 px-1 rounded">npm run dev:avatarframe-api</code>（3010）。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-700">
              运行模式<span className="text-gray-400 font-normal">（非 LV 档位）</span>
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
                <div className="text-[11px] text-gray-600 mb-2">
                  交付 Frame 预览（{FIGMA_FRAME_PREVIEW}×{FIGMA_FRAME_PREVIEW}，与回写一致）—{' '}
                  <span className="font-medium text-gray-800">LV1 · LV2 · LV3 同次生成，一行三列</span>
                </div>
                {framePreviewBusy ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[11px] text-gray-500">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 min-w-0">
                    {(['S', 'M', 'L'] as const).map((lv) => {
                      const url = framePreviewByLevel[lv];
                      return (
                        <div key={lv} className="min-w-0">
                          <div className="text-[11px] font-medium text-gray-700 mb-1">{LEVEL_PREVIEW_LABEL[lv]}</div>
                          {url ? (
                            <div
                              className="rounded-lg border border-gray-300 overflow-hidden shadow-sm"
                              style={{
                                backgroundImage:
                                  'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
                                backgroundSize: '16px 16px',
                                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                              }}
                            >
                              <img
                                src={url}
                                alt={`preview ${lv}`}
                                width={FIGMA_FRAME_PREVIEW}
                                height={FIGMA_FRAME_PREVIEW}
                                className="block w-full h-auto aspect-square object-fill"
                              />
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[11px] text-gray-500">
                              无预览
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                    顶部元素（抠图后；仅 LV3 槽位使用）
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

              <div className="grid grid-cols-3 gap-2">
                {(['S', 'M', 'L'] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    disabled={!canRun || !result.fillsByLevel[lv]}
                    onClick={() => writeBack(lv)}
                    className="h-9 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                  >
                    {state.status === 'writing' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    回写 {LEVEL_PREVIEW_LABEL[lv]}
                  </button>
                ))}
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
