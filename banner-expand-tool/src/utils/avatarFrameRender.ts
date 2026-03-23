import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function loadImage(dataUrl: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("加载图片失败"));
    img.src = dataUrl;
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

  if (params.includePlaceholder && params.placeholderAvatarDataUrl) {
    const avatarImg = await loadImage(params.placeholderAvatarDataUrl);
    const r = Math.floor(Math.min(w, h) * 0.34);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const s = Math.max(1, Math.max(avatarImg.width, avatarImg.height));
    const scale = (r * 2) / s;
    const drawW = avatarImg.width * scale;
    const drawH = avatarImg.height * scale;
    ctx.drawImage(avatarImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    ctx.restore();
  }

  const map = new Map(params.elements.map((e) => [e.id, e] as const));
  for (const id of params.order) {
    const el = map.get(id);
    const src = el?.croppedDataUrl ?? el?.generatedDataUrl ?? el?.dataUrl;
    if (!el || !el.visible || !src) continue;
    const img = await loadImage(src);

    const mode = params.elementRenderMode ?? "transform";
    if (mode === "fullCanvas") {
      ctx.drawImage(img, 0, 0, w, h);
      continue;
    }

    const nw = el.naturalWidth ?? img.width;
    const nh = el.naturalHeight ?? img.height;
    const fit = Math.min(1, (Math.min(w, h) * 0.92) / Math.max(1, Math.max(nw, nh)));
    const scale = clamp(el.scale || 1, 0.05, 3) * fit;

    ctx.save();
    ctx.translate(cx + (el.x || 0), cy + (el.y || 0));
    ctx.rotate(((el.rotate || 0) * Math.PI) / 180);
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
