import type { ReferenceImage } from '../types.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

export function parseFigmaFileKey(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (!host.endsWith('figma.com')) return null
    const m = u.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)\//)
    return m?.[2] ?? null
  } catch {
    return null
  }
}

type FigmaFileResponse = {
  name?: string
  thumbnailUrl?: string
}

export async function fetchFigmaReferenceImage(input: {
  url: string
}): Promise<ReferenceImage | null> {
  const token = env('FIGMA_TOKEN')
  if (!token) return null
  const key = parseFigmaFileKey(input.url)
  if (!key) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${key}`, {
      headers: {
        'x-figma-token': token,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as FigmaFileResponse | null
    const thumb = json?.thumbnailUrl
    if (!thumb || typeof thumb !== 'string') return null

    return {
      url: thumb,
      thumbnailUrl: thumb,
      pageUrl: input.url,
      title: json?.name ? `Figma｜${json.name}` : 'Figma 参考稿',
      source: 'Figma',
      author: 'Figma File',
      license: 'N/A',
      generation: 'search',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

type FigmaImagesResponse = {
  images?: Record<string, string>
}

export function parseFigmaNodeId(url: string): string | null {
  try {
    const u = new URL(url)
    const nodeId = u.searchParams.get('node-id')
    return nodeId && nodeId.trim() ? nodeId.trim() : null
  } catch {
    return null
  }
}

export async function fetchFigmaNodeImageUrl(input: {
  url: string
}): Promise<{ fileKey: string; nodeId: string; imageUrl: string } | null> {
  const token = env('FIGMA_TOKEN')
  if (!token) return null
  const fileKey = parseFigmaFileKey(input.url)
  const nodeId = parseFigmaNodeId(input.url)
  if (!fileKey || !nodeId) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const qs = new URLSearchParams({ ids: nodeId, format: 'png', scale: '2' })
    const res = await fetch(`https://api.figma.com/v1/images/${fileKey}?${qs.toString()}`, {
      headers: {
        'x-figma-token': token,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as FigmaImagesResponse | null
    const img = json?.images?.[nodeId]
    if (!img) return null
    return { fileKey, nodeId, imageUrl: img }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
