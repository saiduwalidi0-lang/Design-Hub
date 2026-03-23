import type { ImageSearchAttempt, ReferenceImage } from '../types.js'
import { stripHtml } from './text.js'

// #region debug-point
function reportDebug(event: Record<string, unknown>): void {
  const url =
    process.env.TRAE_DEBUG_SERVER_URL ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:7777/event')
  if (!url) return
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ts: new Date().toISOString(), where: 'wikimediaSearch', ...event }),
  }).catch(() => {})
}
// #endregion debug-point

type MediaWikiImageInfo = {
  url?: string
  thumburl?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string }>
}

type MediaWikiPage = {
  title?: string
  imageinfo?: MediaWikiImageInfo[]
}

type MediaWikiResponse = {
  query?: {
    pages?: Record<string, MediaWikiPage>
  }
}

const stopwords = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'is',
  'are',
  'be',
  'this',
  'that',
  'page',
  'platform',
  'design',
  'ui',
  'ux',
  'poster',
  'banner',
  'gallery',
  'spec',
  'markdown',
  'inspiration',
  'reference',
  'image',
  'images',
  'livestream',
  'live',
])

function asciiOnly(input: string): string {
  return input
    .replace(/[^\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordsOnly(input: string): string {
  const tokens = (input.match(/[A-Za-z0-9]{2,}/g) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => !stopwords.has(t))

  const uniq: string[] = []
  for (const t of tokens) {
    if (!uniq.includes(t)) uniq.push(t)
    if (uniq.length >= 4) break
  }

  return uniq.join(' ').trim()
}

function buildCandidates(query: string, allowGeneric: boolean): string[] {
  const candidates: string[] = []
  const q1 = query.trim()
  if (q1) candidates.push(q1)

  const kw1 = keywordsOnly(q1)
  if (kw1 && !candidates.includes(kw1)) candidates.push(kw1)

  const q2 = asciiOnly(q1)
  if (q2 && !candidates.includes(q2)) candidates.push(q2)

  const kw2 = keywordsOnly(q2)
  if (kw2 && !candidates.includes(kw2)) candidates.push(kw2)

  if (allowGeneric && candidates.length === 0) candidates.push('poster design inspiration')
  return candidates.slice(0, 3)
}

function pickMeta(
  info: MediaWikiImageInfo,
  key: string,
): string | undefined {
  return stripHtml(info.extmetadata?.[key]?.value)
}

function isSupportedImageUrl(url: string): boolean {
  const u = url.toLowerCase()
  if (u.endsWith('.pdf') || u.endsWith('.djvu') || u.endsWith('.oga') || u.endsWith('.ogv')) return false
  return Boolean(u.match(/\.(png|jpe?g|gif|webp|tiff?|svg)$/))
}

export async function searchReferenceImages(
  query: string,
  limit: number,
  meta?: { direction?: string },
): Promise<{
  images: ReferenceImage[]
  debug: {
    attempts: ImageSearchAttempt[]
    chosenQuery?: string
  }
}> {
  const candidates = buildCandidates(query, !meta?.direction)
  const safeLimit = Math.max(3, Math.min(20, limit))

  let pages: MediaWikiPage[] = []
  const attempts: ImageSearchAttempt[] = []
  let chosenQuery: string | undefined
  for (const q of candidates) {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('format', 'json')
    url.searchParams.set('generator', 'search')
    url.searchParams.set('gsrsearch', q)
    url.searchParams.set('gsrnamespace', '6')
    url.searchParams.set('gsrlimit', String(safeLimit))
    url.searchParams.set('prop', 'imageinfo')
    url.searchParams.set('iiprop', 'url|extmetadata')
    url.searchParams.set('iiurlwidth', '800')
    url.searchParams.set('iiurlheight', '800')

    // #region debug-point
    const requestStartedAt = Date.now()
    reportDebug({ event: 'fetch.start', qPreview: q.slice(0, 160), limit, url: url.toString() })
    // #endregion debug-point

    let res: Response
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6_000)
    try {
      res = await fetch(url, {
        headers: {
          'user-agent': 'ai-design-platform/0.1 (local dev)',
        },
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timeout)
      attempts.push({
        direction: meta?.direction,
        query: q,
        ok: false,
        durationMs: Date.now() - requestStartedAt,
        errorMessage:
          e instanceof Error
            ? e.name === 'AbortError'
              ? 'timeout'
              : e.message
            : String(e),
      })

      // #region debug-point
      reportDebug({
        event: 'fetch.error',
        qPreview: q.slice(0, 160),
        durationMs: Date.now() - requestStartedAt,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorName: e instanceof Error ? e.name : undefined,
        errorStack: e instanceof Error ? e.stack : undefined,
      })
      // #endregion debug-point
      continue
    }

    clearTimeout(timeout)

    // #region debug-point
    reportDebug({ event: 'fetch.end', ok: res.ok, status: res.status, durationMs: Date.now() - requestStartedAt })
    // #endregion debug-point
    if (!res.ok) {
      attempts.push({
        direction: meta?.direction,
        query: q,
        ok: false,
        status: res.status,
        durationMs: Date.now() - requestStartedAt,
      })
      continue
    }

    const data = (await res.json()) as MediaWikiResponse
    pages = Object.values(data.query?.pages ?? {})

    attempts.push({
      direction: meta?.direction,
      query: q,
      ok: true,
      status: res.status,
      pagesCount: pages.length,
      durationMs: Date.now() - requestStartedAt,
    })

    // #region debug-point
    reportDebug({ event: 'parse.pages', pagesCount: pages.length, qPreview: q.slice(0, 160) })
    // #endregion debug-point

    if (pages.length > 0) {
      chosenQuery = q
      break
    }
  }

  const images: ReferenceImage[] = []

  for (const p of pages) {
    const info = p.imageinfo?.[0]
    if (!info?.url) continue
    if (!isSupportedImageUrl(info.url)) continue

    images.push({
      url: info.url,
      thumbnailUrl: info.thumburl,
      pageUrl: info.descriptionurl,
      title: stripHtml(p.title)?.replace(/^File:/, ''),
      source: 'Wikimedia Commons',
      author: pickMeta(info, 'Artist'),
      license: pickMeta(info, 'LicenseShortName') ?? pickMeta(info, 'UsageTerms'),
    })

    if (images.length >= limit) break
  }

  return { images, debug: { attempts, chosenQuery } }
}
