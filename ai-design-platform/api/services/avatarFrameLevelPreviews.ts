/**
 * 与 kv-platform figma `avatarFrameLevelLayout` + `fitImageIntoBox`(contain) + 合成顺序一致，
 * 在 Node 侧生成 LV1(S) / LV2(M) / LV3(L) 三张交付预览图（供飞书等无 Canvas 的调用方）。
 */
import { PNG } from 'pngjs'
import { composeAvatarFrameCompositeFromDataUrls } from './avatarFrameComposite.js'

type Box = { x: number; y: number; width: number; height: number }

const FIGMA_W = 270
const FIGMA_H = 270

const L_ELEMENT1: Box = { x: 87, y: 171, width: 96, height: 96 }
const L_ELEMENT2: Box = { x: 15, y: 171, width: 240, height: 96 }
const L_ELEMENT3: Box = { x: 75, y: 3, width: 120, height: 42 }
/** LV1/LV2 无顶饰 */
const ZERO: Box = { x: 0, y: 0, width: 0, height: 0 }

const M_ELEMENT1: Box = { x: 87, y: 171, width: 96, height: 96 }
const M_ELEMENT2: Box = { x: 27.5, y: 171, width: 216, height: 96 }

const S_ELEMENT1: Box = { x: 99, y: 195, width: 72, height: 72 }
const S_ELEMENT2: Box = { x: 63, y: 195, width: 144, height: 72 }

/** 1×1 全透明 PNG，槽位异常时占位 */
const TRANSPARENT_1PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEBgAEbQp9dQAAAABJRU5ErkJggg=='

type Align = 'center' | 'topCenter' | 'bottomCenter'

type Level = 'S' | 'M' | 'L'

function parsePngFromDataUrl(dataUrl: string): PNG {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/s)
  if (!m?.[1]) throw new Error('invalid_png_data_url')
  return PNG.sync.read(Buffer.from(m[1], 'base64'))
}

function pngToDataUrl(png: PNG): string {
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

function blendAt(dst: PNG, tx: number, ty: number, sr: number, sg: number, sb: number, sa01: number): void {
  if (sa01 <= 0 || tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) return
  const di = (dst.width * ty + tx) << 2
  const dr = dst.data[di]
  const dg = dst.data[di + 1]
  const db = dst.data[di + 2]
  const da01 = dst.data[di + 3] / 255
  const oa = sa01 + da01 * (1 - sa01)
  const or = Math.round((sr * sa01 + dr * da01 * (1 - sa01)) / Math.max(1e-6, oa))
  const og = Math.round((sg * sa01 + dg * da01 * (1 - sa01)) / Math.max(1e-6, oa))
  const ob = Math.round((sb * sa01 + db * da01 * (1 - sa01)) / Math.max(1e-6, oa))
  dst.data[di] = or
  dst.data[di + 1] = og
  dst.data[di + 2] = ob
  dst.data[di + 3] = Math.round(oa * 255)
}

/** contain + 允许放大，与插件 `fitImageIntoBox(..., { allowScaleUp: true })` 一致 */
function fitContainIntoBox(src: PNG, bw: number, bh: number, align: Align): PNG {
  const iw = Math.max(1, src.width)
  const ih = Math.max(1, src.height)
  const boxW = Math.max(1, Math.floor(bw))
  const boxH = Math.max(1, Math.floor(bh))
  const rawScale = Math.min(boxW / iw, boxH / ih)
  const scale = rawScale
  const dw = Math.max(1, Math.round(iw * scale))
  const dh = Math.max(1, Math.round(ih * scale))
  const dx = Math.round((boxW - dw) / 2)
  const dy =
    align === 'topCenter' ? 0 : align === 'bottomCenter' ? boxH - dh : Math.round((boxH - dh) / 2)

  const out = new PNG({ width: boxW, height: boxH })
  for (let i = 0; i < out.data.length; i += 4) out.data[i + 3] = 0

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const px = Math.min(iw - 1, Math.max(0, Math.round((x / dw) * (iw - 1))))
      const py = Math.min(ih - 1, Math.max(0, Math.round((y / dh) * (ih - 1))))
      const si = (iw * py + px) << 2
      blendAt(
        out,
        dx + x,
        dy + y,
        src.data[si],
        src.data[si + 1],
        src.data[si + 2],
        src.data[si + 3] / 255,
      )
    }
  }
  return out
}

function specForLevel(level: Level): {
  level: Level
  figmaFrame: { width: number; height: number }
  targetFrame: { width: number; height: number }
  boxes: Record<string, Box & { align?: Align }>
} {
  const base = {
    level,
    figmaFrame: { width: FIGMA_W, height: FIGMA_H },
    targetFrame: { width: 1024, height: 1024 },
  }
  if (level === 'L') {
    return {
      ...base,
      boxes: {
        element1: { ...L_ELEMENT1, align: 'bottomCenter' },
        element2: { ...L_ELEMENT2, align: 'center' },
        element3: { ...L_ELEMENT3, align: 'topCenter' },
      },
    }
  }
  if (level === 'M') {
    return {
      ...base,
      boxes: {
        element1: { ...M_ELEMENT1, align: 'bottomCenter' },
        element2: { ...M_ELEMENT2, align: 'center' },
        element3: { ...ZERO, align: 'topCenter' },
      },
    }
  }
  return {
    ...base,
    boxes: {
      element1: { ...S_ELEMENT1, align: 'bottomCenter' },
      element2: { ...S_ELEMENT2, align: 'center' },
      element3: { ...ZERO, align: 'topCenter' },
    },
  }
}

function composeOneLevel(
  element1DataUrl: string,
  element2DataUrl: string,
  element3DataUrl: string,
  level: Level,
): string {
  const spec = specForLevel(level)
  const b = spec.boxes
  const p1 = parsePngFromDataUrl(element1DataUrl)
  const p2 = parsePngFromDataUrl(element2DataUrl)
  const p3 = parsePngFromDataUrl(element3DataUrl)

  const f1 = fitContainIntoBox(p1, b.element1.width, b.element1.height, b.element1.align ?? 'bottomCenter')
  const f2 = fitContainIntoBox(p2, b.element2.width, b.element2.height, b.element2.align ?? 'center')

  const e3Url =
    b.element3.width > 0 && b.element3.height > 0
      ? pngToDataUrl(fitContainIntoBox(p3, b.element3.width, b.element3.height, b.element3.align ?? 'topCenter'))
      : TRANSPARENT_1PX_PNG

  return composeAvatarFrameCompositeFromDataUrls({
    element1DataUrl: pngToDataUrl(f1),
    element2DataUrl: pngToDataUrl(f2),
    element3DataUrl: e3Url,
    spec,
  })
}

/** 同一次生成的三抠图 → LV1 / LV2 / LV3 三张合成预览（1024，与 spec.targetFrame 一致） */
export function composeAvatarFrameLvPreviews(input: {
  element1DataUrl: string
  element2DataUrl: string
  element3DataUrl: string
}): { lv1: string; lv2: string; lv3: string } {
  return {
    lv1: composeOneLevel(input.element1DataUrl, input.element2DataUrl, input.element3DataUrl, 'S'),
    lv2: composeOneLevel(input.element1DataUrl, input.element2DataUrl, input.element3DataUrl, 'M'),
    lv3: composeOneLevel(input.element1DataUrl, input.element2DataUrl, input.element3DataUrl, 'L'),
  }
}
