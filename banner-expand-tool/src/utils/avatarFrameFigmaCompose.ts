import type { AvatarFrameElement, AvatarFrameElementId, AvatarFrameLevel } from "@/types/avatarFrameTool";
import { drawPlaceholderAvatarFillSquare } from "@/utils/avatarFramePreviewAvatar";
import { loadImageFromUrl } from "@/utils/image";
import {
  AVATAR_FRAME_FIGMA_TARGET_FRAME,
  AVATAR_FRAME_VIEWER_RING_DEFAULT_SRC,
} from "@/utils/avatarFrameFigmaSpec";
import {
  type AvatarFrameFigmaLayoutKind,
  getFigmaComposeOrderForLevel,
  getFigmaComposeRotationDeg,
  getScaledFigmaBoxesForLevel,
} from "@/utils/avatarFrameLevelSpec";

function figmaFillForLevel(
  el: AvatarFrameElement,
  level: AvatarFrameLevel,
  layout: AvatarFrameFigmaLayoutKind
): string | undefined {
  if (layout === "viewer") {
    const v = el.figmaFillByLevelViewer?.[level];
    if (v) return v;
  }
  return el.figmaFillByLevel?.[level] ?? el.figmaFillDataUrl;
}

/** 圆环整框贴图：优先原图铺满框（不经 fit）；观众侧再无素材时用默认 ring.png */
function composeLayerSrc(
  el: AvatarFrameElement,
  id: AvatarFrameElementId,
  level: AvatarFrameLevel,
  layout: AvatarFrameFigmaLayoutKind
): string | undefined {
  if (id === "element4") {
    const fromEl =
      el.croppedDataUrl ?? el.generatedDataUrl ?? el.dataUrl ?? figmaFillForLevel(el, level, layout);
    if (fromEl) return fromEl;
    if (layout === "viewer") return AVATAR_FRAME_VIEWER_RING_DEFAULT_SRC;
    return undefined;
  }
  return figmaFillForLevel(el, level, layout);
}

export async function composeAvatarFrameFigmaPreview(
  elements: AvatarFrameElement[],
  level: AvatarFrameLevel = "L",
  options?: { placeholderAvatarSrc?: string; figmaLayout?: AvatarFrameFigmaLayoutKind }
) {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_FRAME_FIGMA_TARGET_FRAME.width;
  canvas.height = AVATAR_FRAME_FIGMA_TARGET_FRAME.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ph = options?.placeholderAvatarSrc?.trim();
  if (ph) {
    try {
      await drawPlaceholderAvatarFillSquare(ctx, canvas.width, canvas.height, ph);
    } catch {
      // 底图加载失败时仍绘制框体素材
    }
  }

  const layout = options?.figmaLayout ?? "anchor";
  const boxes = getScaledFigmaBoxesForLevel(AVATAR_FRAME_FIGMA_TARGET_FRAME.width, level, layout);

  const map = new Map(elements.map((e) => [e.id, e] as const));
  const order = getFigmaComposeOrderForLevel(level, layout);
  for (const id of order) {
    const el = map.get(id);
    if (!el?.visible) continue;
    const src = composeLayerSrc(el, id, level, layout);
    if (!src) continue;
    const img = await loadImageFromUrl(src);
    const box = boxes[id];
    if (box.width <= 0 || box.height <= 0) continue;
    const rotDeg = getFigmaComposeRotationDeg(id, level, layout);
    if (rotDeg !== 0) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotDeg * Math.PI) / 180);
      ctx.drawImage(img, -box.width / 2, -box.height / 2, box.width, box.height);
      ctx.restore();
    } else {
      ctx.drawImage(img, box.x, box.y, box.width, box.height);
    }
  }

  return canvas.toDataURL("image/png");
}
