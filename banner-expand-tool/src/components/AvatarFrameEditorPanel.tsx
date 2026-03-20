import { useEffect, useMemo, useRef, useState } from "react";
import AvatarFrameElementCard from "@/components/AvatarFrameElementCard";
import AvatarFramePreviewCard from "@/components/AvatarFramePreviewCard";
import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";
import { fileToDataUrl } from "@/utils/image";
git remote add origin https://github.com/saiduwalidi0-lang/Design-Hub.gitimport { dataUrlToBlob } from "@/utils/image";
import { renderAvatarFrameToCanvas } from "@/utils/avatarFrameRender";
import Button from "@/components/Button";
import { buildAvatarFrameCandidates } from "@/utils/avatarFramePresets";
import { composeAvatarFrameFigmaPreview } from "@/utils/avatarFrameFigmaCompose";
import { Copy } from "lucide-react";

const AVATAR_FRAME_PROMPTS_STORAGE_KEY = "banner-expand-tool:avatar-frame-prompts";

const DEFAULT_AVATAR_FRAME_PROMPTS: Record<AvatarFrameElementId, string> = {
  element1:
    "将图1画面中最主要的一个元素提取出来（不能是标题），如果图片有缺失就将其补全，调小其尺寸，使其与参考图2的奖杯尺寸相似或更小，接着将其替换图2下方的奖杯元素。生成元素在画面的底端中心的位置，背景为纯黑色。",
  element2:
    "生成一个参考图2中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图2改为参考图1的风格，元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择。但不能全部选择参考图2中最主要物品的颜色。除了风格和颜色其余不改变任何东西。背景必须为纯黑色，画面不能出现文字。",
  element3:
    "生成一个参考图2中的元素。生成元素在画布的大小和位置完全遵循图2，绝对不能改变。将参考图2改为参考图1的风格，生成元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择，但至少要选择2种颜色。生成图除了风格，材质和颜色以外其余不改变任何东西。生成元素在画面顶端中心的位置，背景必须为纯黑色，画面不能出现文字",
};

const LEGACY_TOP_PROMPT =
  "顶部元素：生成一个参考图1中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图1改为参考图2的风格，元素的颜色和材质从参考图2中提取，根据参考图1画面风格自由选择。但不能全部选择参考图1中最主要物品的颜色。除了风格和颜色其余不改变任何东西。背景必须为纯黑色，画面不能出现文字。\n\n说明：图1为我们上传的KV；图2为对应的头像框基础元素。";

type AvatarFrameEditorPanelProps = {
  elements: AvatarFrameElement[];
  order: AvatarFrameElementId[];
  setOrder: (next: AvatarFrameElementId[]) => void;
  setElements: (next: AvatarFrameElement[]) => void;
  placeholderAvatarDataUrl: string;
  setPlaceholderAvatarDataUrl: (v: string) => void;
  resetPlaceholderAvatar: () => void;
  aiEnabled: boolean;
  onAiEditElement: (id: AvatarFrameElementId, instruction: string) => Promise<void>;
  onComposeAvatarFrame: () => Promise<void>;
  onShowAvatarResult: () => void;
  autoCutout: boolean;
  setAutoCutout: (v: boolean) => void;
  cutoutMethod: "threshold" | "comfyuiRmbg" | "byteArtist";
  setCutoutMethod: (v: "threshold" | "comfyuiRmbg" | "byteArtist") => void;
  cutoutThreshold: number;
  setCutoutThreshold: (v: number) => void;

  saliencyEndpoint: string;
  setSaliencyEndpoint: (v: string) => void;
  saliencyAppKey: string;
  setSaliencyAppKey: (v: string) => void;
  saliencyAppSecret: string;
  setSaliencyAppSecret: (v: string) => void;
  saliencyOnlyMask: number;
  setSaliencyOnlyMask: (v: number) => void;
  saliencyRefineMask: number;
  setSaliencyRefineMask: (v: number) => void;

  comfyuiModel: "RMBG-2.0" | "INSPYRENET" | "BEN" | "BEN2";
  setComfyuiModel: (v: "RMBG-2.0" | "INSPYRENET" | "BEN" | "BEN2") => void;
  comfyuiProcessRes: number;
  setComfyuiProcessRes: (v: number) => void;
  disabled?: boolean;
};

function moveInArray<T>(arr: T[], from: number, to: number) {
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export default function AvatarFrameEditorPanel(props: AvatarFrameEditorPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [expanded, setExpanded] = useState<AvatarFrameElementId>("element1");
  const [strictMode, setStrictMode] = useState(true);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [previewMode, setPreviewMode] = useState<"frame" | "composite">("frame");

  const previewDims = useMemo(() => {
    const main = props.elements.find((e) => e.id === "element1");
    const baseW = main?.naturalWidth && main.naturalWidth > 0 ? main.naturalWidth : 1024;
    const baseH = main?.naturalHeight && main.naturalHeight > 0 ? main.naturalHeight : 1024;
    const width = 320;
    const height = Math.max(1, Math.round((width * baseH) / Math.max(1, baseW)));
    return { width, height };
  }, [props.elements]);
  const [aiPrompts, setAiPrompts] = useState<Record<AvatarFrameElementId, string>>(() => {
    try {
      const raw = localStorage.getItem(AVATAR_FRAME_PROMPTS_STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Record<AvatarFrameElementId, string>>;
        const saved: Partial<Record<AvatarFrameElementId, string>> = {
          element1: typeof v.element1 === "string" ? v.element1 : undefined,
          element2: typeof v.element2 === "string" ? v.element2 : undefined,
          element3: typeof v.element3 === "string" ? v.element3 : undefined,
        };
        const merged: Record<AvatarFrameElementId, string> = {
          ...DEFAULT_AVATAR_FRAME_PROMPTS,
          ...saved,
        };
        if (saved.element3 === LEGACY_TOP_PROMPT) merged.element3 = DEFAULT_AVATAR_FRAME_PROMPTS.element3;
        return merged;
      }
    } catch {
      // ignore
    }
    return DEFAULT_AVATAR_FRAME_PROMPTS;
  });
  const [aiLoading, setAiLoading] = useState<Record<AvatarFrameElementId, boolean>>({
    element1: false,
    element2: false,
    element3: false,
  });
  const [aiError, setAiError] = useState<Record<AvatarFrameElementId, string | undefined>>({
    element1: undefined,
    element2: undefined,
    element3: undefined,
  });

  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchProgress, setAiBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiBatchError, setAiBatchError] = useState<string | null>(null);

  const [figmaPreviewDataUrl, setFigmaPreviewDataUrl] = useState<string | null>(null);
  const [figmaCopyHint, setFigmaCopyHint] = useState<string | null>(null);

  async function copyImage(dataUrl: string) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error("copy_failed");
      const blob = dataUrlToBlob(dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      setFigmaCopyHint("已复制到剪贴板");
      window.setTimeout(() => setFigmaCopyHint(null), 1600);
    } catch {
      setFigmaCopyHint("复制失败");
      window.setTimeout(() => setFigmaCopyHint(null), 2000);
    }
  }


  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; previewDataUrl: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [saliencyAdvanced, setSaliencyAdvanced] = useState(false);

  const idToElement = useMemo(() => {
    const m = new Map<AvatarFrameElementId, AvatarFrameElement>();
    for (const e of props.elements) m.set(e.id, e);
    return m;
  }, [props.elements]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const hasAny = props.elements.some((e) => Boolean(e.figmaFillDataUrl));
        if (!hasAny) {
          if (!cancelled) setFigmaPreviewDataUrl(null);
          return;
        }
        const url = await composeAvatarFrameFigmaPreview(props.elements);
        if (!cancelled) setFigmaPreviewDataUrl(url);
      } catch {
        if (!cancelled) setFigmaPreviewDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.elements]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AVATAR_FRAME_PROMPTS_STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<Record<AvatarFrameElementId, string>>;
      if (v.element3 === LEGACY_TOP_PROMPT) {
        setAiPrompts((p) =>
          p.element3 === LEGACY_TOP_PROMPT ? { ...p, element3: DEFAULT_AVATAR_FRAME_PROMPTS.element3 } : p
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(AVATAR_FRAME_PROMPTS_STORAGE_KEY, JSON.stringify(aiPrompts));
    } catch {
      // ignore
    }
  }, [aiPrompts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canvasRef.current) return;
      try {
        setPreviewError(undefined);
        await renderAvatarFrameToCanvas({
          canvas: canvasRef.current,
          width: previewDims.width,
          height: previewDims.height,
          dpr: window.devicePixelRatio || 1,
          placeholderAvatarDataUrl: props.placeholderAvatarDataUrl,
          elements: props.elements,
          order: props.order,
          includePlaceholder: previewMode === "composite",
          elementRenderMode: strictMode ? "fullCanvas" : "transform",
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "预览渲染失败";
        setPreviewError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.elements, props.order, props.placeholderAvatarDataUrl, strictMode, previewDims, previewMode]);

  async function onUploadPlaceholder(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const dataUrl = await fileToDataUrl(file);
    props.setPlaceholderAvatarDataUrl(dataUrl);
  }

  function patchElement(id: AvatarFrameElementId, patch: Partial<AvatarFrameElement>) {
    props.setElements(props.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function resetGenerated(id: AvatarFrameElementId) {
    props.setElements(
      props.elements.map((e) =>
        e.id === id
          ? {
              ...e,
              generatedDataUrl: undefined,
              generatedHistory: undefined,
              croppedDataUrl: undefined,
              croppedHistory: undefined,
              figmaFillDataUrl: undefined,
              figmaFillHistory: undefined,
            }
          : e
      )
    );
  }

  function selectGenerated(id: AvatarFrameElementId, dataUrl: string) {
    props.setElements(props.elements.map((e) => (e.id === id ? { ...e, generatedDataUrl: dataUrl } : e)));
  }

  function selectCropped(id: AvatarFrameElementId, dataUrl: string) {
    props.setElements(props.elements.map((e) => (e.id === id ? { ...e, croppedDataUrl: dataUrl } : e)));
  }

  function selectFigmaFill(id: AvatarFrameElementId, dataUrl: string) {
    props.setElements(props.elements.map((e) => (e.id === id ? { ...e, figmaFillDataUrl: dataUrl } : e)));
  }

  function resetElement(id: AvatarFrameElementId) {
    const base = idToElement.get(id);
    if (!base) return;
    patchElement(id, { x: 0, y: 0, scale: 1, rotate: 0, visible: true });
  }

  function moveLayer(id: AvatarFrameElementId, dir: -1 | 1) {
    const idx = props.order.indexOf(id);
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= props.order.length) return;
    props.setOrder(moveInArray(props.order, idx, nextIdx));
  }

  async function runAiEdit(id: AvatarFrameElementId, instructionOverride?: string) {
    const instruction = (instructionOverride ?? aiPrompts[id] ?? "").trim();
    if (!instruction) {
      setAiError((m) => ({ ...m, [id]: "请输入描述词" }));
      return false;
    }
    setAiError((m) => ({ ...m, [id]: undefined }));
    setAiLoading((m) => ({ ...m, [id]: true }));
    try {
      await props.onAiEditElement(id, instruction);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 编辑失败";
      setAiError((m) => ({ ...m, [id]: msg }));
      return false;
    } finally {
      setAiLoading((m) => ({ ...m, [id]: false }));
    }
  }

  async function runAiEditAll() {
    if (aiBatchLoading) return;
    const targets: AvatarFrameElementId[] = (["element1", "element2", "element3"] as const).filter((id) => {
      const el = idToElement.get(id);
      return Boolean(el?.dataUrl);
    });
    if (targets.length === 0) return;

    props.setOrder(["element2", "element3", "element1"]);

    setAiBatchLoading(true);
    setAiBatchError(null);
    setAiBatchProgress({ done: 0, total: targets.length });
    try {
      let done = 0;
      let okAll = true;
      for (const id of targets) {
        const p = (aiPrompts[id] ?? "").trim();
        const ok = await runAiEdit(id, p);
        done += 1;
        setAiBatchProgress({ done, total: targets.length });
        if (!ok) {
          okAll = false;
          const label = id === "element1" ? "主元素" : id === "element2" ? "环绕元素" : "顶部元素";
          setAiBatchError(`${label} 生成失败，请展开查看错误信息`);
          break;
        }
      }

      if (!okAll) return;
      await props.onComposeAvatarFrame();
      props.onShowAvatarResult();
    } finally {
      setAiBatchLoading(false);
    }
  }

  async function buildCandidates() {
    const list = buildAvatarFrameCandidates(props.elements, props.order, strictMode);
    const out: Array<{ id: string; name: string; previewDataUrl: string }> = [];
    for (const c of list) {
      const canvas = document.createElement("canvas");
      await renderAvatarFrameToCanvas({
        canvas,
        width: previewDims.width,
        height: previewDims.height,
        dpr: 1,
        setCssSize: false,
        placeholderAvatarDataUrl: props.placeholderAvatarDataUrl,
        elements: c.elements,
        order: c.order,
        includePlaceholder: true,
        elementRenderMode: strictMode ? "fullCanvas" : "transform",
      });
      out.push({ id: c.id, name: c.name, previewDataUrl: canvas.toDataURL("image/png") });
    }
    setCandidates(out);
    setSelectedCandidateId(out[0]?.id ?? null);
  }

  function applyCandidate(id: string) {
    const list = buildAvatarFrameCandidates(props.elements, props.order, strictMode);
    const hit = list.find((x) => x.id === id);
    if (!hit) return;
    props.setElements(hit.elements);
    props.setOrder(hit.order);
    setSelectedCandidateId(id);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">头像框工作流</div>
          <div className="mt-0.5 text-xs text-zinc-400">
            图 1 = 你上传的 KV；图 2 = 对应元素底图（本区上传）。默认严格模式：不允许改变画布比例与元素位置。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={props.disabled || aiBatchLoading || !props.aiEnabled}
            onClick={() => void runAiEditAll()}
          >
            {aiBatchLoading
              ? `AI 批量编辑中…${aiBatchProgress ? ` ${aiBatchProgress.done}/${aiBatchProgress.total}` : ""}`
              : "一键生成三元素并合成"}
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={props.disabled || aiBatchLoading}
            onClick={() => setAiPrompts(DEFAULT_AVATAR_FRAME_PROMPTS)}
          >
            恢复默认描述词
          </Button>
          <Button variant="ghost" type="button" disabled={props.disabled} onClick={() => void buildCandidates()}>
            生成候选合成
          </Button>
        </div>
      </div>

      {aiBatchError ? (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {aiBatchError}
        </div>
      ) : null}

      <div className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">生成素材预览（用于最后拼合）</div>
            <div className="text-xs text-zinc-400">这里展示三张“生成结果”，方便核对每个元素是否生成正确</div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["element1", "element2", "element3"] as const).map((id) => {
            const el = idToElement.get(id);
            const title = id === "element1" ? "主元素" : id === "element2" ? "环绕元素" : "顶部元素";
            const src = el?.generatedDataUrl;
            return (
              <div key={id} className="rounded-md border border-white/10 bg-zinc-950/40 p-2">
                <div className="mb-1 text-xs font-medium text-zinc-200">{title}</div>
                <div
                  className="overflow-hidden rounded-md"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                    backgroundSize: "18px 18px",
                    backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                  }}
                >
                  {src ? (
                    <img src={src} alt={title} className="block h-auto w-full" />
                  ) : (
                    <div className="px-2 py-6 text-center text-xs text-zinc-500">未生成</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">Figma 合成预览（270 比例 / 1024 分辨率）</div>
            <div className="text-xs text-zinc-400">使用三张 Figma 填充素材按坐标合成，可直接复制到 Figma</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              type="button"
              disabled={props.disabled || !figmaPreviewDataUrl}
              onClick={() => figmaPreviewDataUrl && window.open(figmaPreviewDataUrl, "_blank", "noopener,noreferrer")}
            >
              打开
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={props.disabled || !figmaPreviewDataUrl}
              onClick={() => figmaPreviewDataUrl && void copyImage(figmaPreviewDataUrl)}
            >
              <Copy className="h-4 w-4" />
              复制合成图
            </Button>
          </div>
        </div>
        {figmaCopyHint ? <div className="mt-2 text-xs text-zinc-400">{figmaCopyHint}</div> : null}
        <div
          className="mt-3 overflow-hidden rounded-md border border-white/10"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
          }}
        >
          {figmaPreviewDataUrl ? (
            <img src={figmaPreviewDataUrl} alt="figma_preview" className="block h-auto w-full" />
          ) : (
            <div className="px-2 py-6 text-center text-xs text-zinc-500">未生成</div>
          )}
        </div>
      </div>

      <label className="mb-4 flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-zinc-100">严格锁定（推荐）</div>
          <div className="text-xs text-zinc-400">元素按整张画布叠加，不做缩放/居中适配；保证图生图输出比例不被改变</div>
        </div>
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-500"
          checked={strictMode}
          onChange={(e) => setStrictMode(e.target.checked)}
          disabled={props.disabled}
        />
      </label>

      <div className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">生成后自动抠图</div>
            <div className="text-xs text-zinc-400">用于把图生图输出转为透明底，方便合成头像框</div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={props.autoCutout}
            onChange={(e) => props.setAutoCutout(e.target.checked)}
            disabled={props.disabled}
          />
        </div>
        {props.autoCutout ? (
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">抠图方式</div>
              <select
                value={props.cutoutMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "byteArtist") props.setCutoutMethod("byteArtist");
                  else if (v === "comfyuiRmbg") props.setCutoutMethod("comfyuiRmbg");
                  else props.setCutoutMethod("threshold");
                }}
                disabled={props.disabled}
                className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
              >
                <option value="threshold">去黑底（快速）</option>
                <option value="comfyuiRmbg">本地 ComfyUI RMBG-2.0（推荐）</option>
                <option value="byteArtist">ByteArtist 背景移除（AFR / image_clip）</option>
              </select>
            </label>

            {props.cutoutMethod === "threshold" ? (
              <div className="flex items-center gap-3">
                <div className="text-xs text-zinc-400">阈值</div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={props.cutoutThreshold}
                  onChange={(e) => props.setCutoutThreshold(Number(e.target.value))}
                  className="w-full"
                  disabled={props.disabled}
                />
                <div className="w-10 text-right text-xs text-zinc-200">{props.cutoutThreshold}</div>
              </div>
            ) : props.cutoutMethod === "comfyuiRmbg" ? (
              <div className="grid gap-2">
                <div className="text-xs text-zinc-500">需要本机 ComfyUI 正在运行（工具通过本地代理访问，不需要额外处理跨域）。</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <div className="text-xs text-zinc-400">模型</div>
                    <select
                      value={props.comfyuiModel}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "INSPYRENET") props.setComfyuiModel("INSPYRENET");
                        else if (v === "BEN") props.setComfyuiModel("BEN");
                        else if (v === "BEN2") props.setComfyuiModel("BEN2");
                        else props.setComfyuiModel("RMBG-2.0");
                      }}
                      disabled={props.disabled}
                      className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                    >
                      <option value="RMBG-2.0">RMBG-2.0</option>
                      <option value="INSPYRENET">INSPYRENET</option>
                      <option value="BEN">BEN</option>
                      <option value="BEN2">BEN2</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <div className="text-xs text-zinc-400">process_res</div>
                    <input
                      type="number"
                      value={props.comfyuiProcessRes}
                      onChange={(e) => props.setComfyuiProcessRes(Number(e.target.value))}
                      disabled={props.disabled}
                      className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="text-xs text-zinc-500">限流提醒：请控制 ≤ 1 QPS（共享资源服务）。建议避免超过 4K / 10MP 大图。</div>
                <div className="grid gap-1">
                  <div className="text-xs text-zinc-400">Endpoint</div>
                  <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200">
                    {props.saliencyEndpoint ? props.saliencyEndpoint : "未配置（在 banner-expand-tool/.env.local 里设置 VITE_SALIENCY_SEG_ENDPOINT）"}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <div className="text-xs text-zinc-400">app_key（可选）</div>
                    <input
                      value={props.saliencyAppKey}
                      onChange={(e) => props.setSaliencyAppKey(e.target.value)}
                      disabled={props.disabled}
                      className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                    />
                  </label>
                  <label className="grid gap-1">
                    <div className="text-xs text-zinc-400">app_secret（可选）</div>
                    <input
                      value={props.saliencyAppSecret}
                      onChange={(e) => props.setSaliencyAppSecret(e.target.value)}
                      disabled={props.disabled}
                      className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="text-left text-xs text-indigo-200 hover:text-indigo-100"
                  onClick={() => setSaliencyAdvanced((v) => !v)}
                  disabled={props.disabled}
                >
                  {saliencyAdvanced ? "收起高级设置" : "展开高级设置"}
                </button>

                {saliencyAdvanced ? (
                  <div className="grid gap-2">
                    <div className="text-xs text-zinc-500">此模式按 AFR/image_clip 示例走签名 + multipart 上传，返回 PNG URL 后再下载回填。</div>
                    <div className="text-xs text-zinc-500">app_secret 只建议本地使用，勿在公开环境暴露。</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <AvatarFramePreviewCard
          canvasRef={canvasRef}
          previewWidth={previewDims.width}
          previewHeight={previewDims.height}
          errorText={previewError}
          disabled={props.disabled}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          onUploadPlaceholder={(f) => void onUploadPlaceholder(f)}
          onResetPlaceholder={props.resetPlaceholderAvatar}
        />

        <div className="grid gap-3">
          {props.order.map((id) => {
            const el = idToElement.get(id);
            if (!el) return null;
            const active = expanded === id;
            return (
              <AvatarFrameElementCard
                key={id}
                el={el}
                expanded={active}
                disabled={props.disabled}
                batchOnly
                disableReorder
                aiEnabled={props.aiEnabled}
                aiDone={Boolean(el.generatedDataUrl)}
                aiPrompt={aiPrompts[id] ?? ""}
                setAiPrompt={(v) => setAiPrompts((m) => ({ ...m, [id]: v }))}
                aiLoading={aiLoading[id] ?? false}
                aiError={aiError[id]}
                onAiEdit={() => void runAiEdit(id)}
                disableTransforms={strictMode}
                onExpand={() => setExpanded(id)}
                onMoveUp={() => moveLayer(id, -1)}
                onMoveDown={() => moveLayer(id, 1)}
                onPatch={(patch) => patchElement(id, patch)}
                onResetTransform={() => resetElement(id)}
                onResetGenerated={() => resetGenerated(id)}
                onSelectGenerated={(u) => selectGenerated(id, u)}
                onSelectCropped={(u) => selectCropped(id, u)}
                onSelectFigmaFill={(u) => selectFigmaFill(id, u)}
              />
            );
          })}

          {candidates.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div className="mb-2 text-xs font-medium text-zinc-200">候选合成（点击应用）</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={
                      selectedCandidateId === c.id
                        ? "rounded-md border border-indigo-500/40 bg-indigo-500/10 p-2 text-left"
                        : "rounded-md border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
                    }
                    onClick={() => applyCandidate(c.id)}
                  >
                    <div
                      className="overflow-hidden rounded-md"
                      style={{
                        backgroundImage:
                          "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                        backgroundSize: "18px 18px",
                        backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                      }}
                    >
                      <img src={c.previewDataUrl} alt={c.name} className="block h-auto w-full" />
                    </div>
                    <div className="mt-2 text-xs text-zinc-200">{c.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
