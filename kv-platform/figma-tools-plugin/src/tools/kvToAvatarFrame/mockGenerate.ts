/**
 * 浏览器内本地模拟生成（与 dev-server/avatarframe-api 逻辑对齐，不调用 HTTP）。
 * 用于离线验证「导出 → 生成 → 回写」全链路；正式效果仍需对接真实生成服务。
 */

export type AvatarBox = { x: number; y: number; width: number; height: number };

export type MockSpec = {
  figmaFrame: { width: number; height: number };
  targetFrame: { width: number; height: number };
  boxes: {
    element1: AvatarBox;
    element2: AvatarBox;
    element3: AvatarBox;
  };
};

export type MockGenResult = {
  element1DataUrl: string;
  element2DataUrl: string;
  element3DataUrl: string;
  compositeDataUrl: string;
};

function drawElementCanvas(w: number, h: number, base: [number, number, number], accent: [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},0.16)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.06));
  ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.7)`;
  ctx.fillRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
  return canvas;
}

function canvasToPngDataUrl(c: HTMLCanvasElement) {
  return c.toDataURL('image/png');
}

function scaleBox(box: AvatarBox, sx: number, sy: number): AvatarBox {
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.round(box.width * sx),
    height: Math.round(box.height * sy),
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load_image_failed'));
    img.src = dataUrl;
  });
}

/** 与 avatarframe-api makeCompositePng 一致的绘制顺序与缩放逻辑 */
export async function generateAvatarFrameMock(spec: MockSpec): Promise<MockGenResult> {
  const fw = Math.max(1, spec.figmaFrame.width);
  const fh = Math.max(1, spec.figmaFrame.height);
  const tw = Math.max(1, spec.targetFrame.width);
  const th = Math.max(1, spec.targetFrame.height);
  const sx = tw / fw;
  const sy = th / fh;

  const c1 = drawElementCanvas(spec.boxes.element1.width, spec.boxes.element1.height, [255, 64, 64], [255, 180, 64]);
  const c2 = drawElementCanvas(spec.boxes.element2.width, spec.boxes.element2.height, [64, 128, 255], [64, 220, 255]);
  const c3 =
    spec.boxes.element3.width > 0 && spec.boxes.element3.height > 0
      ? drawElementCanvas(spec.boxes.element3.width, spec.boxes.element3.height, [144, 64, 255], [255, 64, 200])
      : (() => {
          const c = document.createElement('canvas');
          c.width = 1;
          c.height = 1;
          return c;
        })();

  const element1DataUrl = canvasToPngDataUrl(c1);
  const element2DataUrl = canvasToPngDataUrl(c2);
  const element3DataUrl = canvasToPngDataUrl(c3);

  const b1 = scaleBox(spec.boxes.element1, sx, sy);
  const b2 = scaleBox(spec.boxes.element2, sx, sy);
  const b3 = scaleBox(spec.boxes.element3, sx, sy);

  const composite = document.createElement('canvas');
  composite.width = tw;
  composite.height = th;
  const ctx = composite.getContext('2d');
  if (!ctx) throw new Error('canvas_not_supported');
  ctx.clearRect(0, 0, tw, th);

  const [i1, i2, i3] = await Promise.all([loadImage(element1DataUrl), loadImage(element2DataUrl), loadImage(element3DataUrl)]);

  const order: Array<{ box: AvatarBox; img: HTMLImageElement }> = [
    { box: b2, img: i2 },
    { box: b1, img: i1 },
  ];
  if (b3.width > 0 && b3.height > 0) {
    order.push({ box: b3, img: i3 });
  }

  for (const { box, img } of order) {
    if (box.width < 1 || box.height < 1) continue;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, box.x, box.y, box.width, box.height);
  }

  return {
    element1DataUrl,
    element2DataUrl,
    element3DataUrl,
    compositeDataUrl: composite.toDataURL('image/png'),
  };
}

export const defaultMockSpec = (): MockSpec => ({
  figmaFrame: { width: 270, height: 270 },
  targetFrame: { width: 1024, height: 1024 },
  boxes: {
    element1: { x: 87, y: 171, width: 96, height: 96 },
    element2: { x: 15, y: 171, width: 240, height: 96 },
    element3: { x: 75, y: 3, width: 120, height: 42 },
  },
});
