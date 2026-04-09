import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarFrameDefaultGroupOption } from "@/hooks/useAvatarFrameComposer";
import AvatarFrameElementCard from "@/components/AvatarFrameElementCard";
import type {
  AvatarFrameCutoutMethod,
  AvatarFrameElement,
  AvatarFrameElementId,
  AvatarFrameLevel,
} from "@/types/avatarFrameTool";
import { fileToDataUrl } from "@/utils/image";
import { dataUrlToBlob } from "@/utils/image";
import { renderAvatarFrameToCanvas } from "@/utils/avatarFrameRender";
import Button from "@/components/Button";
import { buildAvatarFrameCandidates } from "@/utils/avatarFramePresets";
import { composeAvatarFrameFigmaPreview } from "@/utils/avatarFrameFigmaCompose";
import { AVATAR_FRAME_LEVEL_LABELS } from "@/utils/avatarFrameLevelSpec";
import { Copy } from "lucide-react";

const FIGMA_PREVIEW_LEVELS = ["S", "M", "L"] as const satisfies readonly AvatarFrameLevel[];

type FigmaCompositePreviewMap = Record<AvatarFrameLevel, string | null>;

const EMPTY_FIGMA_COMPOSITE_PREVIEW: FigmaCompositePreviewMap = { S: null, M: null, L: null };

const AVATAR_FRAME_PROMPTS_STORAGE_KEY = "banner-expand-tool:avatar-frame-prompts";

const DEFAULT_AVATAR_FRAME_PROMPTS: Record<AvatarFrameElementId, string> = {
  element1:
    "将图1画面中最主要的一个元素提取出来，如果图片有缺失就将其补全，调小其尺寸，使其与参考图2的奖杯尺寸相似或更小，接着将其替换图2下方的奖杯元素。生成元素在画面的底端中心的位置，背景为纯黑色",
  element2:
    "生成一个参考图2中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图2改为参考图1的风格，元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择。不能全部选择参考图2中最主要物品的颜色，但至少要选择3种颜色，不包含灰色。除了风格和颜色其余不改变任何东西。生成元素必须位于画面中心下方位置。背景必须为纯黑色，画面不能出现现文字",
  element3:
    "生成一个参考图2中的元素。生成元素在画布的大小和位置完全遵循图2，绝对不能改变。将参考图2改为参考图1的风格，生成元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择，但至少要选择3种颜色。生成图除了风格，材质和颜色以外其余不改变任何东西。生成元素在画面顶端中心的位置，生成元素尺寸与参考图2尺寸完全一致。背景必须为纯黑色，画面不能出现文字",
  /** 圆环：全画布 PNG，中间头像区须透明；留空描述词时一键生成会跳过该槽 */
  element4:
    "生成参考图2中的头像框圆环：画布尺寸与圆环整体构图、线条走向及中间留给头像的镂空（透明区域）必须与参考图2完全一致，不得改变形状与透明关系。将参考图2改为参考图1的风格，圆环的颜色与材质从参考图1中提取，根据参考图2结构自由选择用色，但不能全部使用参考图2中最主要物品的颜色。除风格与颜色外，不改变任何轮廓、粗细与透明度分布。圆环外侧与中间头像区域须保持透明，禁止用纯黑或其它不透明色填充镂空。画面不要出现文字。",
};

const LEGACY_TOP_PROMPT =
  "顶部元素：生成一个参考图1中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图1改为参考图2的风格，元素的颜色和材质从参考图2中提取，根据参考图1画面风格自由选择。但不能全部选择参考图1中最主要物品的颜色。除了风格和颜色其余不改变任何东西。背景必须为纯黑色，画面不能出现文字。\n\n说明：图1为我们上传的KV；图2为对应的头像框基础元素。";

type AvatarFrameEditorPanelProps = {
  defaultGroups: AvatarFrameDefaultGroupOption[];
  selectedDefaultSuiteId: string | null;
  /** 当前组为 anchor / viewer（成套选中主播时仍为 anchor，但可能已合并圆环底图） */
  selectedDefaultGroupKind?: "anchor" | "viewer" | null;
  onSelectDefaultSuite: (suiteId: string) => void;
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
  /** 不调模型：用当前底图试生成 Figma 填充，校验槽位 */
  onQuickFigmaSlotPreview: () => Promise<{ ok: true } | { ok: false; message: string }>;
  autoCutout: boolean;
  setAutoCutout: (v: boolean) => void;
  cutoutMethod: AvatarFrameCutoutMethod;
  setCutoutMethod: (v: AvatarFrameCutoutMethod) => void;
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
  /** 每套一列：上主播、下观众（同宽同高）；suiteId 来自 defaults.json */
  const defaultGroupSuites = useMemo(() => {
    const anchors = props.defaultGroups.filter((g) => g.kind === "anchor");
    const viewers = props.defaultGroups.filter((g) => g.kind === "viewer");
    const anchorBySuite = new Map<string, AvatarFrameDefaultGroupOption>();
    for (const g of anchors) anchorBySuite.set(g.suiteId, g);
    const viewerBySuite = new Map<string, AvatarFrameDefaultGroupOption>();
    for (const g of viewers) viewerBySuite.set(g.suiteId, g);
    const keys = [...new Set(anchors.map((a) => a.suiteId))].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) return na - nb;
      return a.localeCompare(b);
    });
    return keys.map((suiteId) => ({
      suiteId,
      anchor: anchorBySuite.get(suiteId)!,
      viewer: viewerBySuite.get(suiteId),
    }));
  }, [props.defaultGroups]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
          element4: typeof v.element4 === "string" ? v.element4 : undefined,
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
    element4: false,
  });
  const [aiError, setAiError] = useState<Record<AvatarFrameElementId, string | undefined>>({
    element1: undefined,
    element2: undefined,
    element3: undefined,
    element4: undefined,
  });

  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchProgress, setAiBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiBatchError, setAiBatchError] = useState<string | null>(null);

  const [figmaPreviewByLevel, setFigmaPreviewByLevel] = useState<FigmaCompositePreviewMap>(EMPTY_FIGMA_COMPOSITE_PREVIEW);
  /** LV3 观众槽合成（与主播槽并行生成、无切换） */
  const [figmaPreviewViewerL, setFigmaPreviewViewerL] = useState<string | null>(null);
  const [figmaCopyHint, setFigmaCopyHint] = useState<string | null>(null);
  const [quickFigmaBusy, setQuickFigmaBusy] = useState(false);
  const [quickFigmaHint, setQuickFigmaHint] = useState<string | null>(null);

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

  /** 圆环：order 含 element4，或成套已合并观众 ring 底图（仅观众 Figma 叠出图，主播主画布不画） */
  const elementCardIds = useMemo(() => {
    const seen = new Set<AvatarFrameElementId>();
    const out: AvatarFrameElementId[] = [];
    for (const id of props.order) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    if (!seen.has("element4")) {
      const el4 = props.elements.find((e) => e.id === "element4");
      if (props.order.includes("element4") || Boolean(el4?.dataUrl?.trim())) {
        out.push("element4");
      }
    }
    return out;
  }, [props.order, props.elements]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        FIGMA_PREVIEW_LEVELS.map(async (level) => {
          const hasAny = props.elements.some((e) => {
            const u = e.figmaFillByLevel?.[level] ?? (level === "L" ? e.figmaFillDataUrl : undefined);
            return Boolean(u);
          });
          if (!hasAny) return [level, null] as const;
          try {
            const url = await composeAvatarFrameFigmaPreview(props.elements, level, {
              placeholderAvatarSrc: props.placeholderAvatarDataUrl,
              figmaLayout: "anchor",
            });
            return [level, url] as const;
          } catch {
            return [level, null] as const;
          }
        })
      );
      let viewerL: string | null = null;
      const hasL = props.elements.some((e) => Boolean(e.figmaFillByLevel?.L ?? e.figmaFillDataUrl));
      if (hasL && !cancelled) {
        try {
          viewerL = await composeAvatarFrameFigmaPreview(props.elements, "L", {
            placeholderAvatarSrc: props.placeholderAvatarDataUrl,
            figmaLayout: "viewer",
          });
        } catch {
          viewerL = null;
        }
      }
      if (cancelled) return;
      const next: FigmaCompositePreviewMap = { S: null, M: null, L: null };
      for (const [level, url] of entries) next[level] = url;
      setFigmaPreviewByLevel(next);
      setFigmaPreviewViewerL(viewerL);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.elements, props.placeholderAvatarDataUrl]);

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
              figmaFillByLevel: undefined,
              figmaFillByLevelViewer: undefined,
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

  async function runAiEdit(
    id: AvatarFrameElementId,
    instructionOverride?: string
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const instruction = (instructionOverride ?? aiPrompts[id] ?? "").trim();
    if (!instruction) {
      const msg = "请输入描述词";
      setAiError((m) => ({ ...m, [id]: msg }));
      return { ok: false, message: msg };
    }
    setAiError((m) => ({ ...m, [id]: undefined }));
    setAiLoading((m) => ({ ...m, [id]: true }));
    try {
      await props.onAiEditElement(id, instruction);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 编辑失败";
      setAiError((m) => ({ ...m, [id]: msg }));
      return { ok: false, message: msg };
    } finally {
      setAiLoading((m) => ({ ...m, [id]: false }));
    }
  }

  function slotLabel(id: AvatarFrameElementId): string {
    if (id === "element1") return "主元素";
    if (id === "element2") return "环绕元素";
    if (id === "element3") return "顶部元素";
    return "圆环";
  }

  async function runAiEditAll() {
    if (aiBatchLoading) return;
    const batchIds: AvatarFrameElementId[] = ["element4", "element1", "element2", "element3"];
    const targets = batchIds.filter((id) => {
      const el = idToElement.get(id);
      if (!el?.dataUrl) return false;
      if (!(aiPrompts[id] ?? "").trim()) return false;
      return true;
    });
    if (targets.length === 0) {
      setAiBatchError("没有可生成的槽位：请为需要出图的槽填写描述词，并确保已加载默认底图。");
      return;
    }

    setAiBatchLoading(true);
    setAiBatchError(null);
    setAiBatchProgress({ done: 0, total: targets.length });
    try {
      let done = 0;
      let anyOk = false;
      const failures: string[] = [];
      for (const id of targets) {
        const p = (aiPrompts[id] ?? "").trim();
        const r = await runAiEdit(id, p);
        done += 1;
        setAiBatchProgress({ done, total: targets.length });
        if (r.ok === true) {
          anyOk = true;
        } else {
          failures.push(`${slotLabel(id)}：${r.message}`);
        }
      }

      if (failures.length > 0) {
        setAiBatchError(
          failures.length === targets.length
            ? `全部槽位失败：${failures.join("；")}`
            : `部分失败（已继续生成其余槽）：${failures.join("；")}`
        );
      }
      if (!anyOk) return;
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
        <div className="text-sm font-semibold">头像框工作流</div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={props.disabled || aiBatchLoading || !props.aiEnabled}
            onClick={() => void runAiEditAll()}
          >
            {aiBatchLoading
              ? `AI 批量编辑中…${aiBatchProgress ? ` ${aiBatchProgress.done}/${aiBatchProgress.total}` : ""}`
              : "一键生成各槽位并合成"}
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

      {props.defaultGroups.length > 0 ? (
        <div className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-3">
          <div className="text-sm font-medium text-zinc-100">默认元素组（成套）</div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {defaultGroupSuites.map(({ suiteId, anchor, viewer }) => {
              const thumbClass = "relative aspect-square w-full overflow-hidden rounded-md border border-white/10 bg-zinc-900";
              const suiteActive = props.selectedDefaultSuiteId === suiteId;

              return (
                <button
                  key={suiteId}
                  type="button"
                  disabled={props.disabled}
                  onClick={() => props.onSelectDefaultSuite(suiteId)}
                  className={
                    suiteActive
                      ? "flex min-w-0 flex-col gap-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 p-2 text-left ring-1 ring-indigo-500/15"
                      : "flex min-w-0 flex-col gap-2 rounded-md border border-white/10 bg-zinc-950/40 p-2 text-left hover:bg-white/10"
                  }
                >
                  <div className="relative min-h-[1rem] text-center">
                    <div className="truncate px-5 text-[11px] font-medium text-zinc-400">{anchor.name}</div>
                    {suiteActive ? (
                      <span className="absolute right-0 top-0 text-[10px] text-indigo-200">当前</span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 text-center text-[10px] font-medium text-emerald-200/85">主播</div>
                      <div className={thumbClass}>
                        {anchor.thumbnailUrl ? (
                          <img
                            src={anchor.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-contain object-center"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="aspect-square h-full w-full"
                            style={{
                              background:
                                "radial-gradient(circle at 20% 75%, rgba(168,85,247,0.35) 0%, rgba(168,85,247,0) 45%), radial-gradient(circle at 78% 20%, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0) 45%), linear-gradient(135deg, #18181b 0%, #09090b 100%)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                    {viewer ? (
                      <div className="min-w-0">
                        <div className="mb-1 text-center text-[10px] font-medium text-sky-200/85">观众</div>
                        <div className={thumbClass}>
                          {viewer.thumbnailUrl ? (
                            <img
                              src={viewer.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-contain object-center"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="aspect-square h-full w-full"
                              style={{
                                background:
                                  "radial-gradient(circle at 30% 70%, rgba(56,189,248,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(167,139,250,0.2) 0%, transparent 50%), linear-gradient(135deg, #0c1422 0%, #09090b 100%)",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <div className="mb-1 text-center text-[10px] font-medium text-zinc-500">观众</div>
                        <div className={`${thumbClass} border-dashed border-white/20 bg-zinc-950/50`} />
                      </div>
                    )}
                  </div>
                  <p className="text-center text-[10px] leading-snug text-zinc-500">
                    圆环底图已合并，生成结果仅叠在下方「观众」Figma 预览
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-zinc-100">Figma 合成预览</div>
          <Button
            variant="ghost"
            type="button"
            size="sm"
            disabled={
              props.disabled ||
              quickFigmaBusy ||
              !props.elements.some((e) => Boolean(e.dataUrl?.trim()))
            }
            onClick={() => {
              void (async () => {
                setQuickFigmaHint(null);
                setQuickFigmaBusy(true);
                try {
                  const r = await props.onQuickFigmaSlotPreview();
                  if (r.ok === false) setQuickFigmaHint(r.message);
                  else setQuickFigmaHint("已用底图试填，请看下方预览");
                } finally {
                  setQuickFigmaBusy(false);
                }
              })();
            }}
          >
            {quickFigmaBusy ? "试填中…" : "试填槽位（不调模型）"}
          </Button>
        </div>
        {quickFigmaHint ? <div className="mt-1 text-xs text-zinc-400">{quickFigmaHint}</div> : null}
        {figmaCopyHint ? <div className="mt-2 text-xs text-zinc-400">{figmaCopyHint}</div> : null}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {FIGMA_PREVIEW_LEVELS.map((lv) => {
            const checkerBg = {
              backgroundImage:
                "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
              backgroundSize: "18px 18px",
              backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
            } as const;

            if (lv === "L") {
              const urlA = figmaPreviewByLevel.L;
              const urlV = figmaPreviewViewerL;
              return (
                <div key={lv} className="flex min-w-0 flex-col gap-2">
                  <div className="text-center text-[11px] font-medium text-zinc-300">{AVATAR_FRAME_LEVEL_LABELS[lv]}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["主播", urlA] as const,
                        ["观众", urlV] as const,
                      ] as const
                    ).map(([sub, url]) => (
                      <div key={sub} className="flex min-w-0 flex-col gap-1">
                        <div className="text-center text-[10px] text-zinc-500">{sub}</div>
                        <div
                          className="aspect-square w-full overflow-hidden rounded-md border border-white/10"
                          style={checkerBg}
                        >
                          {url ? (
                            <img src={url} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <div className="h-full w-full" />
                          )}
                        </div>
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button
                            variant="ghost"
                            type="button"
                            size="sm"
                            disabled={props.disabled || !url}
                            onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                          >
                            打开
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            size="sm"
                            disabled={props.disabled || !url}
                            onClick={() => url && void copyImage(url)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            复制
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            const url = figmaPreviewByLevel[lv];
            return (
              <div key={lv} className="flex min-w-0 flex-col gap-2">
                <div className="text-center text-[11px] font-medium text-zinc-300">{AVATAR_FRAME_LEVEL_LABELS[lv]}</div>
                <div
                  className="aspect-square w-full overflow-hidden rounded-md border border-white/10"
                  style={checkerBg}
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  <Button
                    variant="ghost"
                    type="button"
                    size="sm"
                    disabled={props.disabled || !url}
                    onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                  >
                    打开
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    disabled={props.disabled || !url}
                    onClick={() => url && void copyImage(url)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <label className="mb-4 flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <div className="text-sm font-medium text-zinc-100">严格锁定</div>
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-500"
          checked={strictMode}
          onChange={(e) => setStrictMode(e.target.checked)}
          disabled={props.disabled}
        />
      </label>

      <div className="overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="grid w-full min-w-[44rem] grid-cols-4 gap-2">
          {elementCardIds.map((id) => {
            const el = idToElement.get(id);
            if (!el) return null;
            return (
              <div key={id} className="min-w-0">
                {id === "element4" ? (
                  <p className="mb-1 text-center text-[10px] text-sky-200/75">圆环 · 仅观众 Figma 预览叠图</p>
                ) : null}
                <AvatarFrameElementCard
                  el={el}
                  expanded
                  disabled={props.disabled}
                  batchOnly
                  disableReorder
                  aiEnabled={props.aiEnabled}
                  aiDone={Boolean(el.generatedDataUrl)}
                  aiPrompt={aiPrompts[id] ?? ""}
                  setAiPrompt={(v) => setAiPrompts((m) => ({ ...m, [id]: v }))}
                  aiLoading={aiLoading[id] ?? false}
                  aiError={aiError[id]}
                  onAiEdit={() => {
                    void runAiEdit(id);
                  }}
                  disableTransforms={strictMode}
                  onExpand={() => {}}
                  onMoveUp={() => moveLayer(id, -1)}
                  onMoveDown={() => moveLayer(id, 1)}
                  onPatch={(patch) => patchElement(id, patch)}
                  onResetTransform={() => resetElement(id)}
                  onResetGenerated={() => resetGenerated(id)}
                  onSelectGenerated={(u) => selectGenerated(id, u)}
                  onSelectCropped={(u) => selectCropped(id, u)}
                  onSelectFigmaFill={(u) => selectFigmaFill(id, u)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-zinc-950/40 p-3">
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
  );
}
