import { analyzeImageWithAI, isVisionAiConfigured } from './aiProvider.js'
import { findFigmaCaptionByImageHash, getFigmaCaption, upsertFigmaCaption } from './figmaCaptionStore.js'
import { downloadImageFromUrl } from './httpImage.js'
import { listProjectFiles, listTeamProjects } from './figmaLibrary.js'
import { getFigmaIndexStatus, setFigmaIndexStatus } from './figmaIndexStore.js'
import { sha256Hex } from './imageHash.js'
import { ensureAssetFile } from './assetStore.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

let stopRequested = false
let runningPromise: Promise<void> | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

async function runIndex(input: {
  teamId: string
  maxAnalyze?: number
  concurrency?: number
}): Promise<void> {
  if (!isVisionAiConfigured()) {
    await setFigmaIndexStatus({
      running: false,
      lastError: 'vision_not_configured',
      finishedAt: nowIso(),
    })
    return
  }

  stopRequested = false
  const maxAnalyze = clampInt(input.maxAnalyze, 100, 200_000, 20_000)
  const concurrency = clampInt(input.concurrency, 1, 4, 2)

  await setFigmaIndexStatus({
    running: true,
    startedAt: nowIso(),
    finishedAt: undefined,
    lastError: undefined,
    teamId: input.teamId,
    projectTotal: 0,
    projectDone: 0,
    fileTotal: 0,
    fileSeen: 0,
    fileAnalyzed: 0,
    fileDeduped: 0,
    fileSkipped: 0,
    fileFailed: 0,
    currentProject: undefined,
    currentFile: undefined,
  })

  const projects = await listTeamProjects({ teamId: input.teamId })
  await setFigmaIndexStatus({ projectTotal: projects.length })

  let fileTotal = 0
  for (const p of projects) {
    if (stopRequested) break
    const files = await listProjectFiles(p.id)
    fileTotal += files.length
    if (fileTotal > 2_000_000) break
  }
  await setFigmaIndexStatus({ fileTotal })

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

  let fileSeen = 0
  let fileAnalyzed = 0
  let fileDeduped = 0
  let fileSkipped = 0
  let fileFailed = 0
  let projectDone = 0

  const queue: Array<() => Promise<void>> = []

  const pushTask = (fn: () => Promise<void>) => {
    queue.push(fn)
  }

  const runPool = async () => {
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (!stopRequested) {
        const job = queue.shift()
        if (!job) break
        await job()
      }
    })
    await Promise.all(workers)
  }

  for (const p of projects) {
    if (stopRequested) break
    await setFigmaIndexStatus({ currentProject: p.name })
    const files = await listProjectFiles(p.id)

    for (const f of files) {
      if (stopRequested) break
      fileSeen += 1
      await setFigmaIndexStatus({ fileSeen, currentFile: f.name })

      const thumb = f.thumbnail_url
      if (!thumb) {
        fileSkipped += 1
        continue
      }

      const cached = await getFigmaCaption(f.key).catch(() => null)
      if (cached && cached.lastModified && f.last_modified && cached.lastModified === f.last_modified) {
        fileSkipped += 1
        continue
      }
      if (cached && !cached.lastModified && !f.last_modified) {
        fileSkipped += 1
        continue
      }

      if (fileAnalyzed + fileFailed >= maxAnalyze) {
        stopRequested = true
        break
      }

      pushTask(async () => {
        if (stopRequested) return
        const img = await downloadImageFromUrl({ url: thumb, timeoutMs: 12_000, maxBytes: 1_900_000 })
        if (!img) {
          fileFailed += 1
          await setFigmaIndexStatus({ fileFailed })
          return
        }

        const imageHash = sha256Hex(img.bytes)
        const assetName = await ensureAssetFile({
          nameBase: `figma_thumb_${imageHash.slice(0, 16)}`,
          bytes: img.bytes,
          contentType: img.contentType,
        }).catch(() => undefined)

        const dup = await findFigmaCaptionByImageHash(imageHash).catch(() => null)
        if (dup?.caption) {
          await upsertFigmaCaption({
            fileKey: f.key,
            fileName: f.name,
            projectName: p.name,
            fileUrl: `https://www.figma.com/file/${f.key}/${encodeURIComponent(f.name)}`,
            thumbnailUrl: thumb,
            assetName: assetName ?? dup.assetName,
            lastModified: f.last_modified,
            imageHash,
            caption: dup.caption,
            captionAt: nowIso(),
          }).catch(() => {})

          fileDeduped += 1
          await setFigmaIndexStatus({ fileDeduped })
          return
        }

        const r = await analyzeImageWithAI({ bytes: img.bytes, contentType: img.contentType, prompt })
        if (!r.text) {
          fileFailed += 1
          await setFigmaIndexStatus({ fileFailed })
          return
        }
        await upsertFigmaCaption({
          fileKey: f.key,
          fileName: f.name,
          projectName: p.name,
          fileUrl: `https://www.figma.com/file/${f.key}/${encodeURIComponent(f.name)}`,
          thumbnailUrl: thumb,
          assetName,
          lastModified: f.last_modified,
          imageHash,
          caption: r.text,
          captionAt: nowIso(),
        }).catch(() => {})

        fileAnalyzed += 1
        await setFigmaIndexStatus({ fileAnalyzed })
      })

      if (queue.length >= concurrency * 6) {
        await runPool()
      }
    }

    await runPool()
    projectDone += 1
    await setFigmaIndexStatus({ projectDone })
  }

  await setFigmaIndexStatus({
    running: false,
    finishedAt: nowIso(),
    fileSeen,
    fileAnalyzed,
    fileSkipped,
    fileFailed,
    currentProject: undefined,
    currentFile: undefined,
  })
}

export async function startFigmaIndexJob(input?: {
  teamId?: string
  maxAnalyze?: number
  concurrency?: number
}): Promise<{ started: boolean; status: Awaited<ReturnType<typeof getFigmaIndexStatus>> }> {
  const status = await getFigmaIndexStatus()
  if (status.running && runningPromise) {
    return { started: false, status }
  }

  const teamId = (input?.teamId ?? env('FIGMA_TEAM_ID') ?? '').trim()
  if (!teamId) {
    const s = await setFigmaIndexStatus({ running: false, lastError: 'missing_team_id', finishedAt: nowIso() })
    return { started: false, status: s }
  }

  runningPromise = runIndex({ teamId, maxAnalyze: input?.maxAnalyze, concurrency: input?.concurrency })
    .catch(async (e: any) => {
      const msg = e instanceof Error ? e.message : String(e)
      await setFigmaIndexStatus({ running: false, lastError: msg, finishedAt: nowIso() })
    })
    .finally(() => {
      runningPromise = null
      stopRequested = false
    })

  const s = await getFigmaIndexStatus()
  return { started: true, status: s }
}

export async function stopFigmaIndexJob(): Promise<{ stopped: boolean; status: Awaited<ReturnType<typeof getFigmaIndexStatus>> }> {
  stopRequested = true
  const s = await setFigmaIndexStatus({
    running: false,
    finishedAt: nowIso(),
    lastError: 'stopped',
    currentProject: undefined,
    currentFile: undefined,
  })
  return { stopped: true, status: s }
}
