import type { ReferenceImage } from '../types.js'
import { analyzeImageWithAI, isVisionAiConfigured } from './aiProvider.js'
import { parseFigmaFileKey } from './figma.js'
import { findFigmaCaptionByImageHash, getFigmaCaption, upsertFigmaCaption } from './figmaCaptionStore.js'
import { downloadImageFromUrl } from './httpImage.js'
import { sha256Hex } from './imageHash.js'
import { normalizeQueryToEnTags } from './queryNormalize.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

type FigmaProject = { id: string; name: string }
type FigmaFile = { key: string; name: string; thumbnail_url?: string; last_modified?: string }

type TeamProjectsResponse = { projects?: Array<{ id?: string; name?: string }> }
type ProjectFilesResponse = { files?: Array<{ key?: string; name?: string; thumbnail_url?: string; last_modified?: string }> }

type CacheEntry<T> = { at: number; value: T }

const cache = new Map<string, CacheEntry<any>>()

function cacheGet<T>(key: string, ttlMs: number): T | null {
  const v = cache.get(key)
  if (!v) return null
  if (Date.now() - v.at > ttlMs) {
    cache.delete(key)
    return null
  }
  return v.value as T
}

function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { at: Date.now(), value })
}

async function figmaFetchJson<T>(url: string): Promise<T | null> {
  const token = env('FIGMA_TOKEN')
  if (!token) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      headers: {
        'x-figma-token': token,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as T | null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function listTeamProjects(input?: { teamId?: string }): Promise<FigmaProject[]> {
  const teamId = (input?.teamId ?? env('FIGMA_TEAM_ID') ?? '').trim()
  if (!teamId) return []

  const cacheKey = `figma:team:${teamId}:projects`
  const cached = cacheGet<FigmaProject[]>(cacheKey, 60_000)
  if (cached) return cached

  const json = await figmaFetchJson<TeamProjectsResponse>(`https://api.figma.com/v1/teams/${teamId}/projects`)
  const projects = (json?.projects ?? [])
    .map((p) => ({ id: String(p.id ?? '').trim(), name: String(p.name ?? '').trim() }))
    .filter((p) => p.id && p.name)

  cacheSet(cacheKey, projects)
  return projects
}

export async function listProjectFiles(projectId: string): Promise<FigmaFile[]> {
  const pid = String(projectId || '').trim()
  if (!pid) return []

  const cacheKey = `figma:project:${pid}:files`
  const cached = cacheGet<FigmaFile[]>(cacheKey, 60_000)
  if (cached) return cached

  const json = await figmaFetchJson<ProjectFilesResponse>(`https://api.figma.com/v1/projects/${pid}/files`)
  const files = (json?.files ?? [])
    .map((f) => ({
      key: String(f.key ?? '').trim(),
      name: String(f.name ?? '').trim(),
      thumbnail_url: typeof f.thumbnail_url === 'string' ? f.thumbnail_url : undefined,
      last_modified: typeof f.last_modified === 'string' ? f.last_modified : undefined,
    }))
    .filter((f) => f.key && f.name)

  cacheSet(cacheKey, files)
  return files
}

export async function searchFigmaLibrary(input: {
  query: string
  teamId?: string
  limit?: number
  mode?: 'name' | 'ai'
  scan?: number
}): Promise<{
  results: Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; caption?: string }>
  normalized: { original: string; normalized: string; tags: string[] }
}> {
  const norm = normalizeQueryToEnTags(input.query)
  const q = norm.original.trim().toLowerCase()
  if (!q) return { results: [], normalized: { original: norm.original, normalized: norm.normalized, tags: norm.tags } }
  const limit = Math.max(1, Math.min(30, input.limit ?? 12))
  const teamId = (input.teamId ?? env('FIGMA_TEAM_ID') ?? '').trim()
  if (!teamId) return { results: [], normalized: { original: norm.original, normalized: norm.normalized, tags: norm.tags } }

  const mode = input.mode ?? 'name'

  const cacheKey = `figma:team:${teamId}:search:${mode}:${q}:${limit}`
  const cached = cacheGet<{
    results: Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; caption?: string }>
    normalized: { original: string; normalized: string; tags: string[] }
  }>(cacheKey, 10_000)
  if (cached) return cached

  const projects = await listTeamProjects({ teamId })
  const results: Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; caption?: string }> = []

  const byName: Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; lastModified?: string; key: string }> = []

  for (const p of projects) {
    if (byName.length >= Math.max(limit, 30)) break
    const files = await listProjectFiles(p.id)
    for (const f of files) {
      if (byName.length >= Math.max(limit, 30)) break
      const name = f.name.toLowerCase()
      const fileUrl = `https://www.figma.com/file/${f.key}/${encodeURIComponent(f.name)}`
      if (name.includes(q)) results.push({ name: f.name, fileUrl, thumbnailUrl: f.thumbnail_url, project: p.name })
      byName.push({
        name: f.name,
        fileUrl,
        thumbnailUrl: f.thumbnail_url,
        project: p.name,
        lastModified: f.last_modified,
        key: f.key,
      })
    }
  }

  if (mode === 'ai' && isVisionAiConfigured()) {
    const scoredFromCaptions: Array<{ score: number; item: typeof byName[number]; caption?: string }> = []
    for (const x of byName) {
      const c = await getFigmaCaption(x.key).catch(() => null)
      const cap = c?.caption ?? ''
      const hay = `${x.name} ${x.project ?? ''} ${cap}`.toLowerCase()
      const matched = norm.terms.filter((t) => hay.includes(t.toLowerCase()))
      if (matched.length === 0) continue
      const score = matched.length + (x.name.toLowerCase().includes(q) ? 2 : 0)
      scoredFromCaptions.push({ score, item: x, caption: cap || undefined })
    }
    scoredFromCaptions.sort((a, b) => b.score - a.score)
    const pickedFromCaptions = scoredFromCaptions.slice(0, limit).map((s) => ({
      name: s.item.name,
      fileUrl: s.item.fileUrl,
      thumbnailUrl: s.item.thumbnailUrl,
      project: s.item.project,
      caption: s.caption,
    }))

    if (pickedFromCaptions.length > 0) {
      const payload = { results: pickedFromCaptions, normalized: { original: norm.original, normalized: norm.normalized, tags: norm.tags } }
      cacheSet(cacheKey, payload)
      return payload
    }

    const scan = Math.max(limit, Math.min(400, input.scan ?? 60))
    const pool = byName
      .filter((x) => x.thumbnailUrl)
      .sort((a, b) => (String(b.lastModified ?? '')).localeCompare(String(a.lastModified ?? '')))
      .slice(0, scan)

    const needAnalyze: Array<typeof pool[number]> = []
    for (const x of pool) {
      const c = await getFigmaCaption(x.key).catch(() => null)
      if (!c) {
        needAnalyze.push(x)
        continue
      }
      if (x.lastModified && c.lastModified && x.lastModified !== c.lastModified) {
        needAnalyze.push(x)
        continue
      }
    }

    const prompt =
      'Output in English. Return ONLY the labeled lines below. One line per label, each line <= 180 characters. No extra text, no reasoning, no Markdown.\n' +
      'Design Type: <KV/poster/banner/landing page/popup/feed card/etc.>\n' +
      'Main Title Design: <if any title-like text appears, describe its style; otherwise write N/A>\n' +
      'Composition Method: <layout structure, hierarchy, focal area, whitespace, balance>\n' +
      'Key Elements: <subject/background/decorations/icons/3D objects>\n' +
      'Color & Lighting: <palette, contrast, mood, highlight strategy>\n' +
      'Texture & Material: <materials, rendering style, realism/CG, grain, gloss>\n' +
      'Font Design: <typeface traits, weight, geometry, special treatments; or N/A>\n' +
      'Content Generation Rules: <what must be preserved, what to avoid, stylistic constraints>\n' +
      'Keywords: <10-12 keywords, comma-separated>'

    for (const x of needAnalyze.slice(0, 48)) {
      const img = await downloadImageFromUrl({ url: x.thumbnailUrl!, timeoutMs: 12_000, maxBytes: 1_900_000 })
      if (!img) continue

      const imageHash = sha256Hex(img.bytes)
      const dup = await findFigmaCaptionByImageHash(imageHash).catch(() => null)
      if (dup?.caption) {
        await upsertFigmaCaption({
          fileKey: x.key,
          fileName: x.name,
          projectName: x.project,
          fileUrl: x.fileUrl,
          thumbnailUrl: x.thumbnailUrl,
          lastModified: x.lastModified,
          imageHash,
          caption: dup.caption,
          captionAt: new Date().toISOString(),
        }).catch(() => {})
        continue
      }

      const r = await analyzeImageWithAI({ bytes: img.bytes, contentType: img.contentType, prompt })
      if (!r.text) continue
      await upsertFigmaCaption({
        fileKey: x.key,
        fileName: x.name,
        projectName: x.project,
        fileUrl: x.fileUrl,
        thumbnailUrl: x.thumbnailUrl,
        lastModified: x.lastModified,
        imageHash,
        caption: r.text,
        captionAt: new Date().toISOString(),
      }).catch(() => {})
    }

    const scored: Array<{ score: number; item: typeof pool[number]; caption?: string }> = []
    for (const x of pool) {
      const c = await getFigmaCaption(x.key).catch(() => null)
      const cap = c?.caption ?? ''
      const hay = `${x.name} ${x.project ?? ''} ${cap}`.toLowerCase()
      const matched = norm.terms.filter((t) => hay.includes(t.toLowerCase()))
      if (matched.length === 0) continue
      const score = matched.length + (x.name.toLowerCase().includes(q) ? 2 : 0)
      scored.push({ score, item: x, caption: cap || undefined })
    }
    scored.sort((a, b) => b.score - a.score)
    const picked = scored.slice(0, limit).map((s) => ({
      name: s.item.name,
      fileUrl: s.item.fileUrl,
      thumbnailUrl: s.item.thumbnailUrl,
      project: s.item.project,
      caption: s.caption,
    }))

    if (picked.length > 0) {
      const payload = { results: picked, normalized: { original: norm.original, normalized: norm.normalized, tags: norm.tags } }
      cacheSet(cacheKey, payload)
      return payload
    }
  }

  const final = results.slice(0, limit)
  const payload = { results: final, normalized: { original: norm.original, normalized: norm.normalized, tags: norm.tags } }
  cacheSet(cacheKey, payload)
  return payload
}

export function isFigmaUrl(url: string): boolean {
  return Boolean(parseFigmaFileKey(url))
}

export function asFigmaReferenceFromSearch(item: {
  name: string
  fileUrl: string
  thumbnailUrl?: string
  project?: string
}): ReferenceImage {
  const thumb = item.thumbnailUrl || item.fileUrl
  return {
    url: thumb,
    thumbnailUrl: thumb,
    pageUrl: item.fileUrl,
    title: item.project ? `Figma｜${item.project}｜${item.name}` : `Figma｜${item.name}`,
    source: 'Figma',
    author: 'Figma Library',
    license: 'N/A',
    generation: 'search',
  }
}
