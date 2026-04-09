import avatarFramePreviewBasePng from "@/assets/avatar-frame-preview-base.png";

/**
 * 内置示例头像底图（打包为稳定 URL，避免依赖 `public/` 根路径在代理/子路径下 404，
 * 也不会退回旧版 SVG 渐变占位）。
 */
export const AVATAR_FRAME_DEFAULT_PLACEHOLDER_SRC: string = avatarFramePreviewBasePng;

/** 无静态资源时的 SVG 渐变圆占位（开发与回退） */
export function createDefaultAvatarPlaceholderDataUrl(size = 320) {
  const r = Math.floor(size * 0.34);
  const cx = size / 2;
  const cy = size / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#22C55E"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#111827"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
