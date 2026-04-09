/**
 * 将抠图后的素材按 Figma 槽位尺寸做 contain 对齐（与 banner-expand-tool 一致），不重新调用模型。
 */

export type FigmaFillAlign = 'center' | 'topCenter' | 'bottomCenter';

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('load_image_failed'));
    img.src = dataUrl;
  });
  return img;
}

/** 与交付 Frame 270 逻辑尺寸对齐：贴图像素密度约等于 2048 边长（2K 级），回写 FIT 时更清晰 */
const FIGMA_FRAME_REF = 270;
const FILL_TARGET_LONG_EDGE_PX = 2048;
const DEFAULT_FILL_RESOLUTION_SCALE = FILL_TARGET_LONG_EDGE_PX / FIGMA_FRAME_REF;
/** 防止极端槽位或超大源图撑爆 Canvas / 插件消息体 */
const MAX_FILL_RESOLUTION_SCALE = 12;

/**
 * 槽位在 Figma 里只有 270 逻辑坐标宽，若按 1:1 像素导出，贴图只有几十像素宽，FIT 后极易糊。
 * 默认按 270→2048 换算倍率生成 PNG（无损）；Figma 矩形尺寸不变，仅贴图像素变密。
 * 可通过 options.resolutionScale 覆盖（例如降到 4 以减小体积）。
 */
export async function fitImageIntoBox(
  inputDataUrl: string,
  boxWidth: number,
  boxHeight: number,
  align: FigmaFillAlign,
  options?: { allowScaleUp?: boolean; resolutionScale?: number }
): Promise<string> {
  const img = await loadImageFromDataUrl(inputDataUrl);
  const iw = Math.max(1, Math.floor(img.width));
  const ih = Math.max(1, Math.floor(img.height));
  const rawRs = options?.resolutionScale ?? DEFAULT_FILL_RESOLUTION_SCALE;
  const rs = Math.max(1, Math.min(MAX_FILL_RESOLUTION_SCALE, rawRs));
  const bw = Math.max(1, Math.round(boxWidth * rs));
  const bh = Math.max(1, Math.round(boxHeight * rs));

  const rawScale = Math.min(bw / iw, bh / ih);
  const scale = options?.allowScaleUp === false ? Math.min(1, rawScale) : rawScale;
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));

  const dx = Math.round((bw - dw) / 2);
  const dy = align === 'topCenter' ? 0 : align === 'bottomCenter' ? bh - dh : Math.round((bh - dh) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas.toDataURL('image/png');
}
