import { PNG } from 'pngjs'

type Box = { x: number; y: number; width: number; height: number }
type BoxLogical = Record<'element1' | 'element2' | 'element3', Box>

const DEFAULT_BOXES: BoxLogical = {
  element1: { x: 87, y: 171, width: 96, height: 96 },
  element2: { x: 15, y: 171, width: 240, height: 96 },
  element3: { x: 75, y: 3, width: 120, height: 42 },
}

function dataUrlFromPng(png: PNG): string {
  const buf = PNG.sync.write(png)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function parseImagePngFromDataUrl(dataUrl: string): PNG {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
  if (!m?.[1]) throw new Error('invalid_data_url')
  return PNG.sync.read(Buffer.from(m[1], 'base64'))
}

function pngToDataUrl(png: PNG): string {
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

function readBox(raw: unknown): Box | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const width = Number(o.width)
  const height = Number(o.height)
  if (![x, y, width, height].every((n) => Number.isFinite(n) && n >= 0)) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

function readCompositeLayout(spec: unknown): { targetSize: number; figmaW: number; figmaH: number; boxes: BoxLogical } {
  const s = spec && typeof spec === 'object' ? (spec as Record<string, unknown>) : null

  const target = s?.targetFrame && typeof s.targetFrame === 'object' ? Number((s.targetFrame as { width?: unknown }).width) : 1024
  const targetSize = Number.isFinite(target) && target > 0 ? Math.round(target) : 1024

  const figmaWRaw = s?.figmaFrame && typeof s.figmaFrame === 'object' ? Number((s.figmaFrame as { width?: unknown }).width) : 270
  const figmaHRaw = s?.figmaFrame && typeof s.figmaFrame === 'object' ? Number((s.figmaFrame as { height?: unknown }).height) : 270
  const figmaW = Math.max(1, Math.round(Number.isFinite(figmaWRaw) ? figmaWRaw : 270))
  const figmaH = Math.max(1, Math.round(Number.isFinite(figmaHRaw) ? figmaHRaw : 270))

  let boxes: BoxLogical = { ...DEFAULT_BOXES }
  if (s?.boxes && typeof s.boxes === 'object') {
    const b = s.boxes as Record<string, unknown>
    const e3Raw = b.element3
    const e3 =
      e3Raw !== undefined && e3Raw !== null ? readBox(e3Raw) : null
    boxes = {
      element1: readBox(b.element1) ?? DEFAULT_BOXES.element1,
      element2: readBox(b.element2) ?? DEFAULT_BOXES.element2,
      element3: e3 ?? { x: 0, y: 0, width: 0, height: 0 },
    }
  }

  return { targetSize, figmaW, figmaH, boxes }
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

function drawScaledLayer(dst: PNG, src: PNG, box: Box): void {
  if (box.width < 1 || box.height < 1) return
  const drawW = Math.max(1, box.width)
  const drawH = Math.max(1, box.height)
  for (let y = 0; y < drawH; y += 1) {
    for (let x = 0; x < drawW; x += 1) {
      const px = Math.min(src.width - 1, Math.max(0, Math.round((x / drawW) * (src.width - 1))))
      const py = Math.min(src.height - 1, Math.max(0, Math.round((y / drawH) * (src.height - 1))))
      const si = (src.width * py + px) << 2
      blendAt(dst, box.x + x, box.y + y, src.data[si], src.data[si + 1], src.data[si + 2], src.data[si + 3] / 255)
    }
  }
}

export function trimTransparentBoundsDataUrl(dataUrl: string, alphaThreshold = 1): string {
  const src = parseImagePngFromDataUrl(dataUrl)
  const w = src.width
  const h = src.height
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (w * y + x) << 2
      const a = src.data[i + 3]
      if (a >= alphaThreshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return dataUrl
  const cropW = Math.max(1, maxX - minX + 1)
  const cropH = Math.max(1, maxY - minY + 1)
  const out = new PNG({ width: cropW, height: cropH })

  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const si = (w * (minY + y) + (minX + x)) << 2
      const di = (cropW * y + x) << 2
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }

  return pngToDataUrl(out)
}

export function composeAvatarFrameCompositeFromDataUrls(input: {
  element1DataUrl: string
  element2DataUrl: string
  element3DataUrl: string
  spec?: unknown
}): string {
  const { targetSize, figmaW, figmaH, boxes } = readCompositeLayout(input.spec)
  const scaleX = targetSize / Math.max(1, figmaW)
  const scaleY = targetSize / Math.max(1, figmaH)
  const scaled: Record<'element1' | 'element2' | 'element3', Box> = {
    element1: { x: Math.round(boxes.element1.x * scaleX), y: Math.round(boxes.element1.y * scaleY), width: Math.round(boxes.element1.width * scaleX), height: Math.round(boxes.element1.height * scaleY) },
    element2: { x: Math.round(boxes.element2.x * scaleX), y: Math.round(boxes.element2.y * scaleY), width: Math.round(boxes.element2.width * scaleX), height: Math.round(boxes.element2.height * scaleY) },
    element3: { x: Math.round(boxes.element3.x * scaleX), y: Math.round(boxes.element3.y * scaleY), width: Math.round(boxes.element3.width * scaleX), height: Math.round(boxes.element3.height * scaleY) },
  }

  const out = new PNG({ width: targetSize, height: targetSize })
  out.data.fill(0)

  // 层级与插件回写一致：环绕 -> 主元素 -> 顶部（最上层）；S/M 无顶部时框为 0 跳过
  const layers: Array<{ id: 'element2' | 'element3' | 'element1'; dataUrl: string }> = [
    { id: 'element2', dataUrl: input.element2DataUrl },
    { id: 'element1', dataUrl: input.element1DataUrl },
  ]
  if (scaled.element3.width > 0 && scaled.element3.height > 0) {
    layers.push({ id: 'element3', dataUrl: input.element3DataUrl })
  }
  for (const layer of layers) {
    drawScaledLayer(out, parseImagePngFromDataUrl(layer.dataUrl), scaled[layer.id])
  }

  return dataUrlFromPng(out)
}
