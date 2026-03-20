import { Router, type Request, type Response } from 'express'
import { listTeamProjects, searchFigmaLibrary } from '../services/figmaLibrary.js'
import { getFigmaIndexStatus } from '../services/figmaIndexStore.js'
import { startFigmaIndexJob, stopFigmaIndexJob } from '../services/figmaIndexJob.js'
import { fetchFigmaNodeImageUrl, fetchFigmaReferenceImage } from '../services/figma.js'
import { downloadImageFromUrl } from '../services/httpImage.js'
import { analyzeImageWithAI } from '../services/aiProvider.js'

const router = Router()

router.get('/projects', async (req: Request, res: Response): Promise<void> => {
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined
  const projects = await listTeamProjects({ teamId })
  res.status(200).json({ success: true, projects })
})

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
  const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined
  const scan = typeof req.query.scan === 'string' ? Number(req.query.scan) : undefined
  if (!q.trim()) {
    res.status(400).json({ success: false, error: 'missing_query' })
    return
  }

  const out = await searchFigmaLibrary({
    query: q,
    teamId,
    limit,
    mode: mode === 'ai' ? 'ai' : 'name',
    scan,
  })
  res.status(200).json({ success: true, results: out.results, normalized: out.normalized })
})

router.get('/describe', async (req: Request, res: Response): Promise<void> => {
  const url = typeof req.query.url === 'string' ? req.query.url : ''
  if (!url.trim()) {
    res.status(400).json({ success: false, error: 'missing_url' })
    return
  }

  const node = await fetchFigmaNodeImageUrl({ url }).catch(() => null)
  const thumbUrl = node?.imageUrl
    ? node.imageUrl
    : (await fetchFigmaReferenceImage({ url }).catch(() => null))?.url

  if (!thumbUrl) {
    res.status(400).json({ success: false, error: 'figma_thumbnail_unavailable' })
    return
  }

  const img = await downloadImageFromUrl({ url: thumbUrl, timeoutMs: 12_000, maxBytes: 1_900_000 })
  if (!img) {
    res.status(500).json({ success: false, error: 'thumbnail_download_failed', thumbnailUrl: thumbUrl })
    return
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
  const r = await analyzeImageWithAI({ bytes: img.bytes, contentType: img.contentType, prompt })

  res.status(200).json({
    success: true,
    pageUrl: url,
    thumbnailUrl: thumbUrl,
    caption: r.text,
    error: r.error,
  })
})

router.get('/index/status', async (_req: Request, res: Response): Promise<void> => {
  const status = await getFigmaIndexStatus()
  res.status(200).json({ success: true, status })
})

router.post('/index/start', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as any
  const teamId = typeof body?.teamId === 'string' ? body.teamId : undefined
  const maxAnalyze = typeof body?.maxAnalyze === 'number' ? body.maxAnalyze : typeof body?.maxAnalyze === 'string' ? Number(body.maxAnalyze) : undefined
  const concurrency = typeof body?.concurrency === 'number' ? body.concurrency : typeof body?.concurrency === 'string' ? Number(body.concurrency) : undefined

  const r = await startFigmaIndexJob({ teamId, maxAnalyze, concurrency })
  res.status(200).json({ success: true, started: r.started, status: r.status })
})

router.post('/index/stop', async (_req: Request, res: Response): Promise<void> => {
  const r = await stopFigmaIndexJob()
  res.status(200).json({ success: true, stopped: r.stopped, status: r.status })
})

export default router
