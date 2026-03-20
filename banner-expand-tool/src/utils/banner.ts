import { loadImageFromUrl } from "@/utils/image";

export async function composeBannerPng(inputBlob: Blob, targetWidth: number, targetHeight: number) {
  const url = URL.createObjectURL(inputBlob);
  try {
    const img = await loadImageFromUrl(url);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 不可用");

    const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = targetWidth - drawW;
    const drawY = (targetHeight - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("导出失败"))), "image/png");
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
