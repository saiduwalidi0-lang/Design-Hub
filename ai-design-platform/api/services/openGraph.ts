import type { ReferenceImage } from '../types.js'
import { fetchFigmaNodeImageUrl, fetchFigmaReferenceImage } from './figma.js'

function pickMeta(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  )
  const m = html.match(re)
  return m?.[1]?.trim()
}

function resolveUrl(baseUrl: string, maybeUrl: string): string {
  try {
    return new URL(maybeUrl, baseUrl).toString()
  } catch {
    return maybeUrl
  }
}

function sourceLabel(hostname: string): string {
  const h = hostname.toLowerCase()
  if (h.includes('pinterest.')) return 'Pinterest'
  if (h.includes('behance.')) return 'Behance'
  return hostname
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'ai-design-platform/0.1 (local dev)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    })
    if (!res.ok) return ''
    return await res.text().catch(() => '')
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchReferenceImagesFromUrls(
  urls: string[] | undefined,
  limit: number,
): Promise<ReferenceImage[]> {
  const list = (urls ?? [])
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http://') || u.startsWith('https://'))
    .slice(0, 20)

  const out: ReferenceImage[] = []
  for (const pageUrl of list) {
    if (out.length >= limit) break

    const figmaNode = await fetchFigmaNodeImageUrl({ url: pageUrl }).catch(() => null)
    if (figmaNode?.imageUrl) {
      const url = figmaNode.imageUrl
      out.push({
        url,
        thumbnailUrl: url,
        pageUrl,
        title: 'Figma 节点预览',
        source: 'Figma',
        author: 'Figma Node',
        license: 'N/A',
        generation: 'search',
      })
      continue
    }

    const figma = await fetchFigmaReferenceImage({ url: pageUrl }).catch(() => null)
    if (figma) {
      out.push(figma)
      continue
    }

    const html = await fetchHtml(pageUrl)
    if (!html) continue

    const ogImage =
      pickMeta(html, 'og:image:secure_url') ||
      pickMeta(html, 'og:image') ||
      pickMeta(html, 'twitter:image')

    if (!ogImage) continue

    const title = pickMeta(html, 'og:title')
    let hostname = ''
    try {
      hostname = new URL(pageUrl).hostname
    } catch {
      hostname = ''
    }

    const imageUrl = resolveUrl(pageUrl, ogImage)
    out.push({
      url: imageUrl,
      thumbnailUrl: imageUrl,
      pageUrl,
      title,
      source: hostname ? sourceLabel(hostname) : 'External',
    })
  }

  return out
}
