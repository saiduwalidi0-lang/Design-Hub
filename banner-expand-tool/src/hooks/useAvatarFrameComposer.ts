import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AvatarFrameCutoutMethod,
  AvatarFrameElement,
  AvatarFrameElementId,
  AvatarFrameResultState,
} from "@/types/avatarFrameTool";
import { renderAvatarFrameDataUrls } from "@/utils/avatarFrameRender";
import { AVATAR_FRAME_DEFAULT_PLACEHOLDER_SRC } from "@/utils/defaultAvatarPlaceholder";
import { downloadDataUrl } from "@/utils/downloadDataUrl";
import { makeAvatarFrameFilename } from "@/utils/filenames";
import { getImageSizeFromSrc } from "@/utils/image";
import { applyViewerTransformPreset } from "@/config/avatarFrameViewerPreset";

const AVATAR_FRAME_INITIAL_ELEMENTS: AvatarFrameElement[] = [
  {
    id: "element4",
    label: "圆环",
    required: false,
    visible: true,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  },
  {
    id: "element1",
    label: "主元素",
    required: true,
    visible: true,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  },
  {
    id: "element2",
    label: "环绕元素",
    required: false,
    visible: true,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  },
  {
    id: "element3",
    label: "顶部元素",
    required: false,
    visible: true,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  },
];

/** 语义名优先；末尾为常见 Figma/切片数字导出（仅当文件放在 `public/avatar-frame-defaults/` 根目录且无 JSON 指定 src 时参与探测） */
const AVATAR_FRAME_DEFAULT_FILE_NAMES: Record<AvatarFrameElementId, string[]> = {
  element4: ["element4", "ring", "4"],
  element1: ["element1", "main", "3"],
  element2: ["element2", "surround", "6"],
  element3: ["element3", "top", "5"],
};

function isValidAvatarOrder(o: unknown): o is AvatarFrameElementId[] {
  if (!Array.isArray(o) || o.length < 3) return false;
  const known = new Set<AvatarFrameElementId>(["element1", "element2", "element3", "element4"]);
  return o.every((id) => known.has(id as AvatarFrameElementId));
}

const AVATAR_FRAME_DEFAULT_FILE_EXTS = ["png", "webp", "jpg", "jpeg"];

async function tryLoadDefaultFromFiles(
  id: AvatarFrameElementId,
  cacheBust: number
): Promise<{ src: string; naturalWidth: number; naturalHeight: number } | null> {
  for (const name of AVATAR_FRAME_DEFAULT_FILE_NAMES[id]) {
    for (const ext of AVATAR_FRAME_DEFAULT_FILE_EXTS) {
      const url = `/avatar-frame-defaults/${name}.${ext}?v=${cacheBust}`;
      const size = await getImageSizeFromSrc(url).catch(() => null);
      if (!size) continue;
      return { src: url, naturalWidth: size.width, naturalHeight: size.height };
    }
  }
  return null;
}

/** 避免浏览器强缓存 `public/` 下已更新的 PNG / JSON，开发时换素材后无需手动清缓存 */
function withCacheBust(url: string, bust: number): string {
  if (!url || url.startsWith("data:")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${bust}`;
}

/** 仓库自带默认图（含同源绝对 URL）；非此类则视为用户上传，刷新 JSON 时不覆盖 */
function isBundledAvatarFrameAssetUrl(url: string): boolean {
  const s = String(url).trim();
  if (!s || s.startsWith("data:") || s.startsWith("blob:")) return false;
  if (s.startsWith("/avatar-frame-defaults/")) return true;
  if (typeof window !== "undefined" && s.startsWith(window.location.origin)) {
    return s.includes("/avatar-frame-defaults/");
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).pathname.includes("/avatar-frame-defaults/");
    } catch {
      return false;
    }
  }
  return false;
}

type AvatarFrameDefaultElementConfig = {
  dataUrl?: string;
  src?: string;
};

function elementConfigHasExplicitAsset(conf: AvatarFrameDefaultElementConfig | undefined): boolean {
  if (!conf) return false;
  return Boolean((conf.src ?? "").trim()) || Boolean((conf.dataUrl ?? "").trim());
}

type AvatarFrameDefaultGroupConfig = {
  id?: string;
  name?: string;
  /** 成套 ID：同一 suiteId 的主播组与观众组在 UI 中上下对齐（如 "1"…"5"） */
  suiteId?: string;
  /** 相对 `public/avatar-frame-defaults/`，用于默认元素组卡片缩略图，如 `thumbs/group-1.png` */
  thumbnail?: string;
  /** `viewer`：套用 `avatarFrameViewerPreset` 中的摆位，圆环 + 复用主/环绕/顶底图 */
  preset?: "viewer";
  order?: AvatarFrameElementId[];
  elements?: Partial<Record<AvatarFrameElementId, AvatarFrameDefaultElementConfig>>;
};

type AvatarFrameDefaultsConfig = {
  order?: AvatarFrameElementId[];
  elements?: Partial<Record<AvatarFrameElementId, AvatarFrameDefaultElementConfig>>;
  defaultGroupId?: string;
  groups?: AvatarFrameDefaultGroupConfig[];
};

export type AvatarFrameDefaultGroupOption = {
  id: string;
  name: string;
  thumbnailUrl?: string;
  /** 主播：三槽装饰；观众：与主播共用三槽底图并多圆环 */
  kind: "anchor" | "viewer";
  /** 与 defaults.json `suiteId` 或自 `group-N` / `group-viewer` 推断 */
  suiteId: string;
};

/** 主播套 element1–3 + 同 suite 观众套的圆环底图（order 仍用主播，圆环不进主画布叠层） */
function mergeViewerRingIntoAnchorElements(
  anchorElements: AvatarFrameElement[],
  viewerElements: AvatarFrameElement[] | undefined
): AvatarFrameElement[] {
  const ring = viewerElements?.find((e) => e.id === "element4");
  return anchorElements.map((e) => {
    if (e.id !== "element4") return e;
    if (!ring?.dataUrl) {
      return {
        ...e,
        dataUrl: undefined,
        naturalWidth: undefined,
        naturalHeight: undefined,
        visible: e.visible,
      };
    }
    return {
      ...e,
      dataUrl: ring.dataUrl,
      naturalWidth: ring.naturalWidth,
      naturalHeight: ring.naturalHeight,
      visible: true,
      x: ring.x,
      y: ring.y,
      scale: ring.scale,
      rotate: ring.rotate,
    };
  });
}

function resolveDefaultGroupSuiteId(groupId: string, explicitSuiteId?: string): string {
  const trimmed = (explicitSuiteId ?? "").trim();
  if (trimmed) return trimmed;
  const mNum = /^group-(\d+)$/.exec(groupId);
  if (mNum) return mNum[1];
  if (groupId === "group-viewer") return "1";
  const mViewer = /^group-viewer-(\d+)$/.exec(groupId);
  if (mViewer) return mViewer[1];
  return groupId;
}

export function useAvatarFrameComposer() {
  const [elements, setElements] = useState<AvatarFrameElement[]>(AVATAR_FRAME_INITIAL_ELEMENTS);

  const [order, setOrder] = useState<AvatarFrameElementId[]>(["element2", "element3", "element1"]);
  const [defaultGroups, setDefaultGroups] = useState<AvatarFrameDefaultGroupOption[]>([]);
  const [selectedDefaultGroupId, setSelectedDefaultGroupId] = useState<string | null>(null);

  const [placeholderAvatarDataUrl, setPlaceholderAvatarDataUrl] = useState<string>(
    () => AVATAR_FRAME_DEFAULT_PLACEHOLDER_SRC
  );

  function resetPlaceholderAvatar() {
    setPlaceholderAvatarDataUrl(AVATAR_FRAME_DEFAULT_PLACEHOLDER_SRC);
  }

  const [result, setResult] = useState<AvatarFrameResultState>({ status: "idle" });
  const [costMs, setCostMs] = useState<number | null>(null);

  const [autoCutout, setAutoCutout] = useState(true);
  const [cutoutMethod, setCutoutMethod] = useState<AvatarFrameCutoutMethod>("rmbgLocal");
  const [cutoutThreshold, setCutoutThreshold] = useState(12);

  const [saliencyEndpoint, setSaliencyEndpoint] = useState(
    () => (import.meta.env.VITE_SALIENCY_SEG_ENDPOINT ?? "").trim()
  );
  const [saliencyAppKey, setSaliencyAppKey] = useState(() => (import.meta.env.VITE_SALIENCY_SEG_APP_KEY ?? "").trim());
  const [saliencyAppSecret, setSaliencyAppSecret] = useState(
    () => (import.meta.env.VITE_SALIENCY_SEG_APP_SECRET ?? "").trim()
  );
  const [saliencyOnlyMask, setSaliencyOnlyMask] = useState(3);
  const [saliencyRefineMask, setSaliencyRefineMask] = useState(2);

  const [comfyuiModel, setComfyuiModel] = useState<"RMBG-2.0" | "INSPYRENET" | "BEN" | "BEN2">("RMBG-2.0");
  const [comfyuiProcessRes, setComfyuiProcessRes] = useState(1024);

  const defaultsLoadedRef = useRef(false);
  const defaultGroupsRef = useRef<
    Array<{
      id: string;
      name: string;
      thumbnail?: string;
      suiteId: string;
      order: AvatarFrameElementId[];
      elements: AvatarFrameElement[];
      preset?: "viewer";
    }>
  >([]);

  async function resolveDefaultElement(
    el: AvatarFrameElement,
    defs: Partial<Record<AvatarFrameElementId, AvatarFrameDefaultElementConfig>>,
    cacheBust: number
  ) {
    const conf = defs[el.id];
    const srcFromConfig = (conf?.src ?? "").trim();
    const directDataUrl = (conf?.dataUrl ?? "").trim();
    const rawConfigured = srcFromConfig
      ? srcFromConfig.startsWith("/") || /^https?:\/\//i.test(srcFromConfig) || srcFromConfig.startsWith("data:")
        ? srcFromConfig
        : `/avatar-frame-defaults/${srcFromConfig.replace(/^\/+/, "")}`
      : "";
    const configuredSrc = rawConfigured ? withCacheBust(rawConfigured, cacheBust) : "";
    if (configuredSrc) {
      const size = await getImageSizeFromSrc(configuredSrc).catch(() => null);
      if (size) {
        return {
          ...el,
          dataUrl: configuredSrc,
          naturalWidth: size.width,
          naturalHeight: size.height,
          visible: true,
        };
      }
    }
    if (directDataUrl) {
      const size = await getImageSizeFromSrc(directDataUrl).catch(() => ({ width: undefined, height: undefined }));
      return {
        ...el,
        dataUrl: directDataUrl,
        naturalWidth: size.width,
        naturalHeight: size.height,
        visible: true,
      };
    }
    return { ...el };
  }

  /**
   * 组配置：JSON →（仅当该槽位**未**在 JSON 里写 src 时）根目录语义/数字文件名。
   * 若写了 `sets/group-N/surround.png` 等但加载失败，**不可**回落到根目录 `surround.png`，否则各组会串成同一套图。
   */
  async function resolveDefaultElementForGroup(
    el: AvatarFrameElement,
    defs: Partial<Record<AvatarFrameElementId, AvatarFrameDefaultElementConfig>>,
    cacheBust: number
  ): Promise<AvatarFrameElement> {
    const hasExplicitAsset = elementConfigHasExplicitAsset(defs[el.id]);
    const fromConfig = await resolveDefaultElement(el, defs, cacheBust);
    if (fromConfig.dataUrl) return fromConfig;
    if (hasExplicitAsset) return fromConfig;
    const fileDefault = await tryLoadDefaultFromFiles(el.id, cacheBust);
    if (fileDefault?.src) {
      return {
        ...el,
        dataUrl: fileDefault.src,
        naturalWidth: fileDefault.naturalWidth,
        naturalHeight: fileDefault.naturalHeight,
        visible: true,
      };
    }
    return fromConfig;
  }

  async function buildElementsFromConfig(
    defs: Partial<Record<AvatarFrameElementId, AvatarFrameDefaultElementConfig>>,
    cacheBust: number
  ) {
    return await Promise.all(
      AVATAR_FRAME_INITIAL_ELEMENTS.map(async (el) => {
        const hasExplicit = elementConfigHasExplicitAsset(defs[el.id]);
        const fromConfig = await resolveDefaultElement(el, defs, cacheBust);
        if (fromConfig.dataUrl) return fromConfig;
        if (hasExplicit) return fromConfig;
        const fileDefault = await tryLoadDefaultFromFiles(el.id, cacheBust);
        if (fileDefault?.src) {
          return {
            ...el,
            dataUrl: fileDefault.src,
            naturalWidth: fileDefault.naturalWidth,
            naturalHeight: fileDefault.naturalHeight,
            visible: true,
          };
        }
        return fromConfig;
      })
    );
  }

  function applyDefaultGroup(id: string) {
    const hit = defaultGroupsRef.current.find((g) => g.id === id);
    if (!hit) return;
    let templateElements = hit.elements;
    if (hit.preset !== "viewer") {
      const viewer = defaultGroupsRef.current.find(
        (g) => g.suiteId === hit.suiteId && g.preset === "viewer"
      );
      templateElements = mergeViewerRingIntoAnchorElements(hit.elements, viewer?.elements);
    }
    const byId = new Map(templateElements.map((e) => [e.id, e] as const));
    setElements((prev) => {
      const merged = prev.map((cur) => {
        const def = byId.get(cur.id);
        if (!def) return cur;
        if (!def.dataUrl) {
          return {
            ...cur,
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            dataUrl: undefined,
            naturalWidth: undefined,
            naturalHeight: undefined,
            generatedDataUrl: undefined,
            generatedHistory: undefined,
            croppedDataUrl: undefined,
            croppedHistory: undefined,
            figmaFillDataUrl: undefined,
            figmaFillByLevel: undefined,
            figmaFillByLevelViewer: undefined,
            figmaFillHistory: undefined,
          };
        }
        return {
          ...cur,
          dataUrl: def.dataUrl,
          naturalWidth: def.naturalWidth,
          naturalHeight: def.naturalHeight,
          visible: true,
          x: def.x,
          y: def.y,
          scale: def.scale,
          rotate: def.rotate,
          generatedDataUrl: undefined,
          generatedHistory: undefined,
          croppedDataUrl: undefined,
          croppedHistory: undefined,
          figmaFillDataUrl: undefined,
          figmaFillByLevel: undefined,
          figmaFillByLevelViewer: undefined,
          figmaFillHistory: undefined,
        };
      });
      return hit.preset === "viewer" ? applyViewerTransformPreset(merged) : merged;
    });
    setOrder(hit.order.slice());
    setSelectedDefaultGroupId(id);
  }

  /** 成套选中：等同载入该 suite 的主播组（已自动合并同 suite 观众圆环底图） */
  function applyDefaultSuite(suiteId: string) {
    const anchor = defaultGroupsRef.current.find((g) => g.suiteId === suiteId && g.preset !== "viewer");
    if (!anchor) return;
    applyDefaultGroup(anchor.id);
  }

  const selectedDefaultSuiteId = useMemo(() => {
    if (!selectedDefaultGroupId) return null;
    const g = defaultGroups.find((x) => x.id === selectedDefaultGroupId);
    return g?.suiteId ?? null;
  }, [defaultGroups, selectedDefaultGroupId]);

  const selectedDefaultGroupKind = useMemo((): "anchor" | "viewer" | null => {
    if (!selectedDefaultGroupId) return null;
    const g = defaultGroups.find((x) => x.id === selectedDefaultGroupId);
    return g?.kind ?? null;
  }, [defaultGroups, selectedDefaultGroupId]);

  useEffect(() => {
    let cancelled = false;
    const loadDefaults = async () => {
      const cacheBust = Date.now();
      try {
        const json = await (async () => {
          const res = await fetch(withCacheBust("/avatar-frame-defaults/defaults.json", cacheBust), {
            cache: "no-store",
          });
          if (!res.ok) return null;
          return (await res.json()) as AvatarFrameDefaultsConfig;
        })();
        const legacyOrder: AvatarFrameElementId[] = ["element2", "element3", "element1"];
        const baseOrder = isValidAvatarOrder(json?.order) ? json.order : legacyOrder;
        const baseElements = await buildElementsFromConfig(json?.elements ?? {}, cacheBust);

        const groupConfigs = (json?.groups ?? []).filter((g) => g && g.id && g.name);
        const groups = await Promise.all(
          groupConfigs.map(async (g) => {
            const groupElements = await Promise.all(
              AVATAR_FRAME_INITIAL_ELEMENTS.map(async (el) => {
                return await resolveDefaultElementForGroup(el, g.elements ?? {}, cacheBust);
              })
            );
            const thumb =
              typeof g.thumbnail === "string" && g.thumbnail.trim() ? g.thumbnail.trim().replace(/^\/+/, "") : undefined;
            const gid = String(g.id);
            return {
              id: gid,
              name: String(g.name),
              thumbnail: thumb,
              suiteId: resolveDefaultGroupSuiteId(gid, typeof g.suiteId === "string" ? g.suiteId : undefined),
              order: isValidAvatarOrder(g.order) ? g.order : baseOrder,
              elements: groupElements,
              preset: g.preset === "viewer" ? ("viewer" as const) : undefined,
            };
          })
        );

        const mergedGroups =
          groups.length > 0
            ? groups
            : [
                {
                  id: "default",
                  name: "默认元素组",
                  thumbnail: undefined,
                  suiteId: "1",
                  order: baseOrder,
                  elements: baseElements,
                  preset: undefined,
                },
              ];
        const preferredGroupId = json?.defaultGroupId && mergedGroups.some((g) => g.id === json.defaultGroupId)
          ? json.defaultGroupId
          : mergedGroups[0]?.id;
        const selectedGroup = mergedGroups.find((g) => g.id === preferredGroupId) ?? mergedGroups[0];
        let nextElements = selectedGroup?.elements ?? baseElements;
        if (selectedGroup?.preset === "viewer") {
          nextElements = applyViewerTransformPreset(nextElements.map((e) => ({ ...e })));
        } else if (selectedGroup) {
          const viewerForSuite = mergedGroups.find(
            (g) => g.suiteId === selectedGroup.suiteId && g.preset === "viewer"
          );
          if (viewerForSuite) {
            nextElements = mergeViewerRingIntoAnchorElements(nextElements, viewerForSuite.elements);
          }
        }
        const nextOrder = selectedGroup?.order ?? baseOrder;

        if (cancelled) return;
        defaultGroupsRef.current = mergedGroups;
        setDefaultGroups(
          mergedGroups.map((g) => ({
            id: g.id,
            name: g.name,
            thumbnailUrl: g.thumbnail
              ? withCacheBust(`/avatar-frame-defaults/${g.thumbnail.replace(/^\/+/, "")}`, cacheBust)
              : undefined,
            kind: g.preset === "viewer" ? ("viewer" as const) : ("anchor" as const),
            suiteId: g.suiteId,
          }))
        );
        setSelectedDefaultGroupId(selectedGroup?.id ?? null);
        const nextById = new Map(nextElements.map((e) => [e.id, e] as const));
        setElements((prev) =>
          prev.map((cur) => {
            const def = nextById.get(cur.id);
            if (!def) return cur;
            const curUrl = cur.dataUrl;
            const isUserOverride = Boolean(curUrl) && !isBundledAvatarFrameAssetUrl(curUrl);
            if (isUserOverride) return cur;
            if (!def.dataUrl) {
              return {
                ...cur,
                x: 0,
                y: 0,
                scale: 1,
                rotate: 0,
                dataUrl: undefined,
                naturalWidth: undefined,
                naturalHeight: undefined,
                generatedDataUrl: undefined,
                generatedHistory: undefined,
                croppedDataUrl: undefined,
                croppedHistory: undefined,
                figmaFillDataUrl: undefined,
                figmaFillByLevel: undefined,
                figmaFillByLevelViewer: undefined,
                figmaFillHistory: undefined,
              };
            }
            return {
              ...cur,
              dataUrl: def.dataUrl,
              naturalWidth: def.naturalWidth,
              naturalHeight: def.naturalHeight,
              visible: true,
              x: def.x,
              y: def.y,
              scale: def.scale,
              rotate: def.rotate,
              generatedDataUrl: undefined,
              generatedHistory: undefined,
              croppedDataUrl: undefined,
              croppedHistory: undefined,
              figmaFillDataUrl: undefined,
              figmaFillByLevel: undefined,
              figmaFillByLevelViewer: undefined,
              figmaFillHistory: undefined,
            };
          })
        );
        setOrder(nextOrder);
        defaultsLoadedRef.current = nextElements.every((e) => e.id === "element4" || Boolean(e.dataUrl));
      } catch {
        // ignore
      }
    };

    void loadDefaults();

    if (import.meta.env.DEV) {
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        void loadDefaults();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const canGenerate = useMemo(() => Boolean(elements.find((e) => e.id === "element1" && e.dataUrl)), [elements]);

  async function generate() {
    const t0 = performance.now();
    const main = elements.find((e) => e.id === "element1");
    if (!main || !main.dataUrl) {
      setResult({ status: "error", message: "默认素材缺失：主元素" });
      setCostMs(Math.round(performance.now() - t0));
      return;
    }

    setResult({ status: "loading" });
    setCostMs(null);
    try {
      const baseW = main.naturalWidth && main.naturalWidth > 0 ? main.naturalWidth : 1024;
      const baseH = main.naturalHeight && main.naturalHeight > 0 ? main.naturalHeight : 1024;
      const width = 1024;
      const height = Math.max(1, Math.round((width * baseH) / Math.max(1, baseW)));
      const { framePngDataUrl, compositePngDataUrl } = await renderAvatarFrameDataUrls({
        width,
        height,
        placeholderAvatarDataUrl,
        elements,
        order,
        elementRenderMode: "fullCanvas",
      });
      setResult({ status: "success", framePngDataUrl, compositePngDataUrl });
      setCostMs(Math.round(performance.now() - t0));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "头像框合成失败";
      setResult({ status: "error", message: msg });
      setCostMs(Math.round(performance.now() - t0));
    }
  }

  function download(kind: "frame" | "composite") {
    if (result.status !== "success") return;
    const dataUrl = kind === "frame" ? result.framePngDataUrl : result.compositePngDataUrl;
    downloadDataUrl(dataUrl, makeAvatarFrameFilename(kind));
  }

  return {
    elements,
    setElements,
    order,
    setOrder,
    placeholderAvatarDataUrl,
    setPlaceholderAvatarDataUrl,
    resetPlaceholderAvatar,
    result,
    costMs,
    canGenerate,
    generate,
    download,
    setResult,
    setCostMs,
    autoCutout,
    setAutoCutout,
    cutoutMethod,
    setCutoutMethod,
    cutoutThreshold,
    setCutoutThreshold,

    saliencyEndpoint,
    setSaliencyEndpoint,
    saliencyAppKey,
    setSaliencyAppKey,
    saliencyAppSecret,
    setSaliencyAppSecret,
    saliencyOnlyMask,
    setSaliencyOnlyMask,
    saliencyRefineMask,
    setSaliencyRefineMask,

    comfyuiModel,
    setComfyuiModel,
    comfyuiProcessRes,
    setComfyuiProcessRes,
    defaultGroups,
    selectedDefaultSuiteId,
    selectedDefaultGroupKind,
    applyDefaultGroup,
    applyDefaultSuite,
  };
}
