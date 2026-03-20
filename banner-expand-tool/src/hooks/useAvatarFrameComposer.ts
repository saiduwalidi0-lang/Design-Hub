import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarFrameElement, AvatarFrameElementId, AvatarFrameResultState } from "@/types/avatarFrameTool";
import { renderAvatarFrameDataUrls } from "@/utils/avatarFrameRender";
import { createDefaultAvatarPlaceholderDataUrl } from "@/utils/defaultAvatarPlaceholder";
import { downloadDataUrl } from "@/utils/downloadDataUrl";
import { makeAvatarFrameFilename } from "@/utils/filenames";
import { getImageSizeFromSrc } from "@/utils/image";

const AVATAR_FRAME_INITIAL_ELEMENTS: AvatarFrameElement[] = [
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

const AVATAR_FRAME_DEFAULT_FILE_NAMES: Record<AvatarFrameElementId, string[]> = {
  element1: ["element1", "main"],
  element2: ["element2", "surround"],
  element3: ["element3", "top"],
};

const AVATAR_FRAME_DEFAULT_FILE_EXTS = ["png", "webp", "jpg", "jpeg"];

export function useAvatarFrameComposer() {
  const [elements, setElements] = useState<AvatarFrameElement[]>(AVATAR_FRAME_INITIAL_ELEMENTS);

  const [order, setOrder] = useState<AvatarFrameElementId[]>(["element2", "element3", "element1"]);

  const [placeholderAvatarDataUrl, setPlaceholderAvatarDataUrl] = useState<string>(() =>
    createDefaultAvatarPlaceholderDataUrl(320)
  );

  function resetPlaceholderAvatar() {
    setPlaceholderAvatarDataUrl(createDefaultAvatarPlaceholderDataUrl(320));
  }

  const [result, setResult] = useState<AvatarFrameResultState>({ status: "idle" });
  const [costMs, setCostMs] = useState<number | null>(null);

  const [autoCutout, setAutoCutout] = useState(true);
  const [cutoutMethod, setCutoutMethod] = useState<"threshold" | "comfyuiRmbg" | "byteArtist">("comfyuiRmbg");
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

  useEffect(() => {
    let cancelled = false;
    const loadDefaults = async () => {
      try {
        const json = await (async () => {
          const res = await fetch("/avatar-frame-defaults/defaults.json", { cache: "no-store" });
          if (!res.ok) return null;
          return (await res.json()) as {
            order?: AvatarFrameElementId[];
            elements?: Partial<Record<AvatarFrameElementId, { dataUrl?: string }>>;
          };
        })();
        const nextOrder: AvatarFrameElementId[] = ["element2", "element3", "element1"];
        const defs = json?.elements ?? {};

        async function tryLoadDefaultFromFiles(id: AvatarFrameElementId) {
          for (const name of AVATAR_FRAME_DEFAULT_FILE_NAMES[id]) {
            for (const ext of AVATAR_FRAME_DEFAULT_FILE_EXTS) {
              const url = `/avatar-frame-defaults/${name}.${ext}?v=${Date.now()}`;
              const size = await getImageSizeFromSrc(url).catch(() => null);
              if (!size) continue;
              return { src: url, naturalWidth: size.width, naturalHeight: size.height };
            }
          }
          return null;
        }

        const nextElements = await Promise.all(
          AVATAR_FRAME_INITIAL_ELEMENTS.map(async (el) => {
            const fileDefault = await tryLoadDefaultFromFiles(el.id);
            if (fileDefault?.src) {
              return {
                ...el,
                dataUrl: fileDefault.src,
                naturalWidth: fileDefault.naturalWidth,
                naturalHeight: fileDefault.naturalHeight,
                visible: true,
              };
            }

            const def = defs[el.id];
            const dataUrl = def?.dataUrl;
            if (!dataUrl) return el;
            const size = await getImageSizeFromSrc(dataUrl).catch(() => ({ width: undefined, height: undefined }));
            return {
              ...el,
              dataUrl,
              naturalWidth: size.width,
              naturalHeight: size.height,
              visible: true,
            };
          })
        );

        if (cancelled) return;
        const nextById = new Map(nextElements.map((e) => [e.id, e] as const));
        setElements((prev) =>
          prev.map((cur) => {
            const def = nextById.get(cur.id);
            if (!def?.dataUrl) return cur;
            const curUrl = cur.dataUrl;
            const isUserOverride = Boolean(curUrl) && !String(curUrl).startsWith("/avatar-frame-defaults/");
            if (isUserOverride) return cur;
            return {
              ...cur,
              dataUrl: def.dataUrl,
              naturalWidth: def.naturalWidth,
              naturalHeight: def.naturalHeight,
              visible: true,
            };
          })
        );
        setOrder(nextOrder);
        defaultsLoadedRef.current = nextElements.every((e) => Boolean(e.dataUrl));
      } catch {
        // ignore
      }
    };

    void loadDefaults();
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
  };
}
