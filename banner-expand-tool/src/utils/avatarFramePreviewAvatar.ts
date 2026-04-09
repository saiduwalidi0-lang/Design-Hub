import { loadImageFromUrl } from "@/utils/image";

/**
 * 将占位头像以「铺满画布」方式绘制（等同 CSS object-fit: cover），
 * 用于 Figma 合成预览与合成叠底，避免中间小圆+四周棋盘格的空洞感。
 */
export async function drawPlaceholderAvatarFillSquare(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  placeholderAvatarSrc: string
) {
  const w = Math.max(1, Math.floor(frameWidth));
  const h = Math.max(1, Math.floor(frameHeight));
  const avatarImg = await loadImageFromUrl(placeholderAvatarSrc);
  const iw = Math.max(1, avatarImg.width);
  const ih = Math.max(1, avatarImg.height);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(avatarImg, dx, dy, dw, dh);
}
