export function dataUrlToBase64(dataUrl: string) {
  const idx = dataUrl.indexOf(",");
  if (idx === -1) return dataUrl;
  return dataUrl.slice(idx + 1);
}

export async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function dataUrlToBlob(dataUrl: string) {
  const m = /^data:([^;]+);base64,/.exec(dataUrl);
  const mimeType = m?.[1] || "application/octet-stream";
  const base64 = dataUrlToBase64(dataUrl);
  return base64ToBlob(base64, mimeType);
}

export async function resizeImageDataUrlContain(inputDataUrl: string, targetWidth: number, targetHeight: number) {
  const img = await loadImageFromUrl(inputDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(targetWidth));
  canvas.height = Math.max(1, Math.floor(targetHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  ctx.drawImage(img, x, y, w, h);
  return canvas.toDataURL("image/png");
}

export async function removeNearBlackBackgroundToTransparent(inputDataUrl: string, threshold = 10) {
  const img = await loadImageFromUrl(inputDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(img.width));
  canvas.height = Math.max(1, Math.floor(img.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const t = Math.max(0, Math.min(255, Math.floor(threshold)));
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    if (r <= t && g <= t && b <= t) {
      data.data[i + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function resizeImageDataUrlExact(inputDataUrl: string, targetWidth: number, targetHeight: number) {
  const img = await loadImageFromUrl(inputDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(targetWidth));
  canvas.height = Math.max(1, Math.floor(targetHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function getImageSizeFromDataUrl(dataUrl: string) {
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("读取图片尺寸失败"));
    img.src = dataUrl;
  });
}

export async function getImageSizeFromSrc(src: string) {
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = (img as unknown as { naturalWidth?: number }).naturalWidth ?? img.width;
      const h = (img as unknown as { naturalHeight?: number }).naturalHeight ?? img.height;
      resolve({ width: w, height: h });
    };
    img.onerror = () => reject(new Error("读取图片尺寸失败"));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

export async function ensureDataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`读取图片失败（HTTP ${res.status}）`);
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

export async function loadImageFromUrl(url: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("加载图片失败"));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

export async function trimTransparentBounds(inputDataUrl: string, alphaThreshold = 1) {
  const img = await loadImageFromUrl(inputDataUrl);
  const w = Math.max(1, Math.floor(img.width));
  const h = Math.max(1, Math.floor(img.height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = data[(y * w + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { dataUrl: inputDataUrl, width: w, height: h };
  }

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);
  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 不可用");
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return { dataUrl: out.toDataURL("image/png"), width: cropW, height: cropH };
}

export async function fitImageIntoBox(
  inputDataUrl: string,
  boxWidth: number,
  boxHeight: number,
  align: "center" | "topCenter" | "bottomCenter",
  options?: { allowScaleUp?: boolean }
) {
  const img = await loadImageFromUrl(inputDataUrl);
  const iw = Math.max(1, Math.floor(img.width));
  const ih = Math.max(1, Math.floor(img.height));
  const bw = Math.max(1, Math.floor(boxWidth));
  const bh = Math.max(1, Math.floor(boxHeight));

  const rawScale = Math.min(bw / iw, bh / ih);
  const scale = options?.allowScaleUp === false ? Math.min(1, rawScale) : rawScale;
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));

  const dx = Math.round((bw - dw) / 2);
  const dy = align === "topCenter" ? 0 : align === "bottomCenter" ? bh - dh : Math.round((bh - dh) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas.toDataURL("image/png");
}
