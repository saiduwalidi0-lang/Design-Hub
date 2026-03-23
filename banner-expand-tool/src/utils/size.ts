export function parseWxH(size: string) {
  const m = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(size);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

export function pixelCountFromSize(size: string) {
  const wh = parseWxH(size);
  if (!wh) return null;
  return wh.width * wh.height;
}

export function normalizeBannerGenerationSize(input: string, minPixels: number) {
  const v = typeof input === "string" ? input.trim() : "";
  const px = pixelCountFromSize(v);
  if (px !== null && px < minPixels) return "3840x1024";
  return v.length > 0 ? v : "3840x1024";
}
