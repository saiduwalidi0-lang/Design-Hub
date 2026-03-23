import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";
import { loadImageFromUrl } from "@/utils/image";
import { AVATAR_FRAME_FIGMA_TARGET_FRAME, getScaledFigmaBoxes } from "@/utils/avatarFrameFigmaSpec";

export async function composeAvatarFrameFigmaPreview(elements: AvatarFrameElement[]) {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_FRAME_FIGMA_TARGET_FRAME.width;
  canvas.height = AVATAR_FRAME_FIGMA_TARGET_FRAME.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const boxes = getScaledFigmaBoxes(AVATAR_FRAME_FIGMA_TARGET_FRAME.width);

  const map = new Map(elements.map((e) => [e.id, e] as const));
  const order: AvatarFrameElementId[] = ["element2", "element3", "element1"];
  for (const id of order) {
    const el = map.get(id);
    if (!el?.visible) continue;
    const src = el.figmaFillDataUrl;
    if (!src) continue;
    const img = await loadImageFromUrl(src);
    const box = boxes[id];
    ctx.drawImage(img, box.x, box.y, box.width, box.height);
  }

  return canvas.toDataURL("image/png");
}
