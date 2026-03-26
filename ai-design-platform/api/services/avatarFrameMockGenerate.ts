/**
 * 未配置 Ark 图生图时的占位生成（与 figma-tools-plugin/dev-server/avatarframe-api 对齐）。
 * 便于本地「开箱即用」；配置 ARK_I2I_* 或 ARK_IMAGE_* 后走真实 AI。
 */
import { PNG } from 'pngjs'

type Rgba = { r: number; g: number; b: number; a: number }

function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return { r, g, b, a }
}

function dataUrlFromPng(png: PNG) {
  const buf = PNG.sync.write(png)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function fill(png: PNG, color: Rgba) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (png.width * y + x) << 2
      png.data[i] = color.r
      png.data[i + 1] = color.g
      png.data[i + 2] = color.b
      png.data[i + 3] = color.a
    }
  }
}

function drawRect(png: PNG, x0: number, y0: number, w: number, h: number, color: Rgba) {
  const x1 = Math.min(png.width, Math.max(0, x0 + w))
  const y1 = Math.min(png.height, Math.max(0, y0 + h))
  const xs = Math.min(png.width, Math.max(0, x0))
  const ys = Math.min(png.height, Math.max(0, y0))
  for (let y = ys; y < y1; y += 1) {
    for (let x = xs; x < x1; x += 1) {
      const i = (png.width * y + x) << 2
      png.data[i] = color.r
      png.data[i + 1] = color.g
      png.data[i + 2] = color.b
      png.data[i + 3] = color.a
    }
  }
}

function makeElementPng(w: number, h: number, baseColor: Rgba, accentColor: Rgba) {
  const png = new PNG({ width: w, height: h })
  fill(png, rgba(0, 0, 0, 0))
  drawRect(png, 0, 0, w, h, rgba(baseColor.r, baseColor.g, baseColor.b, 40))
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06))
  drawRect(png, pad, pad, w - pad * 2, h - pad * 2, rgba(accentColor.r, accentColor.g, accentColor.b, 180))
  return png
}

function scaleBox(box: { x: number; y: number; width: number; height: number }, sx: number, sy: number) {
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.round(box.width * sx),
    height: Math.round(box.height * sy),
  }
}

type BoxLogical = Record<'element1' | 'element2' | 'element3', { x: number; y: number; width: number; height: number }>

function makeCompositePng(
  targetSize: number,
  boxesLogical: BoxLogical,
  images: Record<'element1' | 'element2' | 'element3', string>,
  scaleFromFigma: { w: number; h: number }
) {
  const png = new PNG({ width: targetSize, height: targetSize })
  fill(png, rgba(0, 0, 0, 0))
  const fsx = targetSize / Math.max(1, scaleFromFigma.w)
  const fsy = targetSize / Math.max(1, scaleFromFigma.h)
  const boxes: Partial<Record<'element1' | 'element2' | 'element3', ReturnType<typeof scaleBox>>> = {}
  for (const id of ['element1', 'element2', 'element3'] as const) {
    if (boxesLogical[id]) boxes[id] = scaleBox(boxesLogical[id], fsx, fsy)
  }
  const order: Array<'element2' | 'element3' | 'element1'> = ['element2', 'element1', 'element3']
  for (const id of order) {
    const box = boxes[id]
    const src = images[id]
    if (!box || !src || box.width < 1 || box.height < 1) continue
    const srcPng = PNG.sync.read(Buffer.from(src, 'base64'))
    const sw = srcPng.width
    const sh = srcPng.height
    for (let y = 0; y < box.height; y += 1) {
      for (let x = 0; x < box.width; x += 1) {
        const tx = box.x + x
        const ty = box.y + y
        if (tx < 0 || ty < 0 || tx >= png.width || ty >= png.height) continue
        const px = Math.min(sw - 1, Math.max(0, Math.round((x / box.width) * (sw - 1))))
        const py = Math.min(sh - 1, Math.max(0, Math.round((y / box.height) * (sh - 1))))
        const si = (sw * py + px) << 2
        const sr = srcPng.data[si]
        const sg = srcPng.data[si + 1]
        const sb = srcPng.data[si + 2]
        const sa = srcPng.data[si + 3] / 255
        if (sa <= 0) continue
        const di = (png.width * ty + tx) << 2
        const dr = png.data[di]
        const dg = png.data[di + 1]
        const db = png.data[di + 2]
        const da = png.data[di + 3] / 255
        const oa = sa + da * (1 - sa)
        const or = Math.round((sr * sa + dr * da * (1 - sa)) / Math.max(1e-6, oa))
        const og = Math.round((sg * sa + dg * da * (1 - sa)) / Math.max(1e-6, oa))
        const ob = Math.round((sb * sa + db * da * (1 - sa)) / Math.max(1e-6, oa))
        png.data[di] = or
        png.data[di + 1] = og
        png.data[di + 2] = ob
        png.data[di + 3] = Math.round(oa * 255)
      }
    }
  }
  return png
}

function readBox(raw: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const width = Number(o.width)
  const height = Number(o.height)
  if (![x, y, width, height].every((n) => Number.isFinite(n) && n >= 0)) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

const DEFAULT_BOXES: BoxLogical = {
  element1: { x: 87, y: 171, width: 96, height: 96 },
  element2: { x: 15, y: 171, width: 240, height: 96 },
  element3: { x: 75, y: 3, width: 120, height: 42 },
}

export function generateAvatarFrameMockFromBody(body: unknown): {
  element1DataUrl: string
  element2DataUrl: string
  element3DataUrl: string
  compositeDataUrl: string
} {
  const spec =
    body && typeof body === 'object' && 'spec' in body && (body as { spec?: unknown }).spec && typeof (body as { spec: unknown }).spec === 'object'
      ? ((body as { spec: Record<string, unknown> }).spec as Record<string, unknown>)
      : null

  const target = spec && typeof spec.targetFrame === 'object' && spec.targetFrame !== null
    ? Number((spec.targetFrame as { width?: unknown }).width)
    : 1024
  const targetSize = Number.isFinite(target) && target > 0 ? Math.round(target) : 1024

  const ff =
    spec && typeof spec.figmaFrame === 'object' && spec.figmaFrame !== null
      ? {
          w: Math.max(1, Math.round(Number((spec.figmaFrame as { width?: unknown }).width) || 270)),
          h: Math.max(1, Math.round(Number((spec.figmaFrame as { height?: unknown }).height) || 270)),
        }
      : { w: 270, h: 270 }

  let boxes: BoxLogical = { ...DEFAULT_BOXES }
  if (spec?.boxes && typeof spec.boxes === 'object') {
    const b = spec.boxes as Record<string, unknown>
    const e1 = readBox(b.element1) ?? DEFAULT_BOXES.element1
    const e2 = readBox(b.element2) ?? DEFAULT_BOXES.element2
    const e3Raw = b.element3
    const e3 =
      e3Raw !== undefined && e3Raw !== null ? readBox(e3Raw) : null
    boxes = {
      element1: e1,
      element2: e2,
      element3: e3 ?? { x: 0, y: 0, width: 0, height: 0 },
    }
  }

  const e1 = makeElementPng(boxes.element1.width, boxes.element1.height, rgba(255, 64, 64), rgba(255, 180, 64))
  const e2 = makeElementPng(boxes.element2.width, boxes.element2.height, rgba(64, 128, 255), rgba(64, 220, 255))
  const e3 =
    boxes.element3.width > 0 && boxes.element3.height > 0
      ? makeElementPng(boxes.element3.width, boxes.element3.height, rgba(144, 64, 255), rgba(255, 64, 200))
      : (() => {
          const p = new PNG({ width: 1, height: 1 })
          fill(p, rgba(0, 0, 0, 0))
          return p
        })()

  const element1DataUrl = dataUrlFromPng(e1)
  const element2DataUrl = dataUrlFromPng(e2)
  const element3DataUrl = dataUrlFromPng(e3)

  const images = {
    element1: Buffer.from(element1DataUrl.split(',')[1] || '', 'base64').toString('base64'),
    element2: Buffer.from(element2DataUrl.split(',')[1] || '', 'base64').toString('base64'),
    element3: Buffer.from(element3DataUrl.split(',')[1] || '', 'base64').toString('base64'),
  }

  const composite = makeCompositePng(targetSize, boxes, images, ff)
  const compositeDataUrl = dataUrlFromPng(composite)

  return { element1DataUrl, element2DataUrl, element3DataUrl, compositeDataUrl }
}
