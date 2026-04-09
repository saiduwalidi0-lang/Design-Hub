import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";
import { drawPlaceholderAvatarFillSquare } from "@/utils/avatarFramePreviewAvatar";
import { AVATAR_FRAME_VIEWER_RING_DEFAULT_SRC } from "@/utils/avatarFrameFigmaSpec";
import { getFigmaComposeRotationDeg, getScaledFigmaBoxesForLevel } from "@/utils/avatarFrameLevelSpec";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("加载图片失败"));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

export async function renderAvatarFrameToCanvas(params: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr?: number;
  setCssSize?: boolean;
  placeholderAvatarDataUrl?: string;
  elements: AvatarFrameElement[];
  order: AvatarFrameElementId[];
  includePlaceholder: boolean;
  elementRenderMode?: "transform" | "fullCanvas";
}) {
  const dpr = Math.max(1, params.dpr ?? 1);
  const w = Math.max(1, Math.floor(params.width));
  const h = Math.max(1, Math.floor(params.height));
  params.canvas.width = Math.round(w * dpr);
  params.canvas.height = Math.round(h * dpr);
  if (params.setCssSize !== false) {
    params.canvas.style.width = `${w}px`;
    params.canvas.style.height = `${h}px`;
  }

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = params.canvas.getContext("2d");
  } catch {
    return;
  }
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  /** 观众默认 order 以圆环为首；装饰层与 Figma 一致：270 画板视为居中于 `min(w,h)` 的正方形，槽位用 `getScaledFigmaBoxesForLevel` 取整结果（同合成） */
  const alignViewerSurroundCenter =
    params.order[0] === "element4" && params.elementRenderMode !== "fullCanvas";
  const fr = Math.min(w, h);
  const viewerFrameOx = alignViewerSurroundCenter ? (w - fr) / 2 : 0;
  const viewerFrameOy = alignViewerSurroundCenter ? (h - fr) / 2 : 0;
  const viewerLBoxes = alignViewerSurroundCenter
    ? getScaledFigmaBoxesForLevel(fr, "L", "viewer")
    : null;

  if (params.includePlaceholder && params.placeholderAvatarDataUrl) {
    await drawPlaceholderAvatarFillSquare(ctx, w, h, params.placeholderAvatarDataUrl);
  }

  const map = new Map(params.elements.map((e) => [e.id, e] as const));
  for (const id of params.order) {
    const el = map.get(id);
    const useViewerL2FigmaFill =
      alignViewerSurroundCenter && el?.id === "element2" && Boolean(el.figmaFillByLevelViewer?.L);
    const useViewerL3FigmaFill =
      alignViewerSurroundCenter && el?.id === "element3" && Boolean(el.figmaFillByLevelViewer?.L);
    let src = useViewerL2FigmaFill
      ? el!.figmaFillByLevelViewer!.L!
      : useViewerL3FigmaFill
        ? el!.figmaFillByLevelViewer!.L!
        : (el?.croppedDataUrl ?? el?.generatedDataUrl ?? el?.dataUrl);
    if (!src && alignViewerSurroundCenter && el?.id === "element4") {
      src = AVATAR_FRAME_VIEWER_RING_DEFAULT_SRC;
    }
    if (!el || !el.visible || !src) continue;
    const img = await loadImage(src);

    const mode = params.elementRenderMode ?? "transform";
    if (mode === "fullCanvas") {
      ctx.drawImage(img, 0, 0, w, h);
      continue;
    }

    if (el.id === "element4") {
      ctx.drawImage(img, 0, 0, w, h);
      continue;
    }

    let tcx: number;
    let tcy: number;
    if (viewerLBoxes && (el.id === "element2" || el.id === "element3")) {
      const box = el.id === "element2" ? viewerLBoxes.element2 : viewerLBoxes.element3;
      tcx = viewerFrameOx + box.x + box.width / 2 + (el.x || 0);
      tcy = viewerFrameOy + box.y + box.height / 2 + (el.y || 0);
    } else {
      tcx = cx + (el.x || 0);
      tcy = cy + (el.y || 0);
    }

    /** 与 `composeAvatarFrameFigmaPreview` 一致：Figma -45° 类 → 规范角 +45°，再加面板 rotate 微调 */
    const viewerFigmaRotDeg =
      alignViewerSurroundCenter && (el.id === "element2" || el.id === "element3")
        ? getFigmaComposeRotationDeg(el.id, "L", "viewer") + (el.rotate || 0)
        : null;

    if (useViewerL2FigmaFill && viewerLBoxes) {
      const slot = viewerLBoxes.element2;
      const userScale = clamp(el.scale || 1, 0.05, 3);
      const dw = Math.max(1, slot.width * userScale);
      const dh = Math.max(1, slot.height * userScale);
      ctx.save();
      ctx.translate(tcx, tcy);
      ctx.rotate(((viewerFigmaRotDeg ?? 0) * Math.PI) / 180);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      continue;
    }

    if (useViewerL3FigmaFill && viewerLBoxes) {
      const slot = viewerLBoxes.element3;
      const userScale = clamp(el.scale || 1, 0.05, 3);
      const dw = Math.max(1, slot.width * userScale);
      const dh = Math.max(1, slot.height * userScale);
      ctx.save();
      ctx.translate(tcx, tcy);
      ctx.rotate(((viewerFigmaRotDeg ?? 0) * Math.PI) / 180);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      continue;
    }

    const nw = el.naturalWidth ?? img.width;
    const nh = el.naturalHeight ?? img.height;
    const fit = Math.min(1, (Math.min(w, h) * 0.92) / Math.max(1, Math.max(nw, nh)));
    const scale = clamp(el.scale || 1, 0.05, 3) * fit;

    ctx.save();
    ctx.translate(tcx, tcy);
    ctx.rotate(
      ((viewerFigmaRotDeg !== null ? viewerFigmaRotDeg : el.rotate || 0) * Math.PI) / 180
    );
    ctx.scale(scale, scale);
    ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
  }
}

export async function renderAvatarFrameDataUrls(params: {
  width: number;
  height: number;
  placeholderAvatarDataUrl?: string;
  elements: AvatarFrameElement[];
  order: AvatarFrameElementId[];
  elementRenderMode?: "transform" | "fullCanvas";
}) {
  const frameCanvas = document.createElement("canvas");
  const compositeCanvas = document.createElement("canvas");
  await renderAvatarFrameToCanvas({
    canvas: frameCanvas,
    width: params.width,
    height: params.height,
    dpr: 1,
    setCssSize: false,
    placeholderAvatarDataUrl: params.placeholderAvatarDataUrl,
    elements: params.elements,
    order: params.order,
    includePlaceholder: false,
    elementRenderMode: params.elementRenderMode,
  });
  await renderAvatarFrameToCanvas({
    canvas: compositeCanvas,
    width: params.width,
    height: params.height,
    dpr: 1,
    setCssSize: false,
    placeholderAvatarDataUrl: params.placeholderAvatarDataUrl,
    elements: params.elements,
    order: params.order,
    includePlaceholder: true,
    elementRenderMode: params.elementRenderMode,
  });
  return {
    framePngDataUrl: frameCanvas.toDataURL("image/png"),
    compositePngDataUrl: compositeCanvas.toDataURL("image/png"),
  };
}
