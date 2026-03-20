import { Router, type Request, type Response } from 'express'
import { deleteFigmaCaption, listFigmaCaptions, upsertFigmaCaption } from '../services/figmaCaptionStore.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function isLocalRequest(req: Request): boolean {
  const ip = req.ip || ''
  return ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1')
}

function allowAdmin(req: Request): boolean {
  const token = env('FEISHU_ADMIN_TOKEN')
  if (!token) return isLocalRequest(req)
  const got = req.header('x-admin-token')
  return typeof got === 'string' && got === token
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

const router = Router()

router.get('/figma-captions', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
  const offset = clampInt(req.query.offset, 0, 500_000, 0)
  const limit = clampInt(req.query.limit, 1, 200, 30)

  const all = await listFigmaCaptions()
  const filtered = q
    ? all.filter((x) => {
        const hay = `${x.fileName} ${x.projectName ?? ''} ${x.caption}`.toLowerCase()
        return hay.includes(q)
      })
    : all

  filtered.sort((a, b) => String(b.captionAt ?? '').localeCompare(String(a.captionAt ?? '')))

  const total = filtered.length
  const items = filtered.slice(offset, offset + limit)
  res.status(200).json({ success: true, total, items })
})

router.delete('/figma-captions/:fileKey', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }
  const fileKey = String(req.params.fileKey || '').trim()
  if (!fileKey) {
    res.status(400).json({ success: false, error: 'missing_file_key' })
    return
  }
  const ok = await deleteFigmaCaption(fileKey)
  res.status(200).json({ success: true, deleted: ok })
})

router.post('/figma-captions/update', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }
  const body = req.body as any
  const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.trim() : ''
  const caption = typeof body?.caption === 'string' ? body.caption.trim() : ''
  if (!fileKey || !caption) {
    res.status(400).json({ success: false, error: 'missing_fields' })
    return
  }

  const items = await listFigmaCaptions()
  const existing = items.find((x) => x.fileKey === fileKey)
  if (!existing) {
    res.status(404).json({ success: false, error: 'not_found' })
    return
  }

  await upsertFigmaCaption({
    ...existing,
    caption,
    captionAt: new Date().toISOString(),
  })

  res.status(200).json({ success: true })
})

router.post('/figma-captions/dedupe', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }

  const body = req.body as any
  const mode = typeof body?.mode === 'string' ? body.mode : 'imageHash'
  const dryRun = Boolean(body?.dryRun)

  if (mode !== 'imageHash') {
    res.status(400).json({ success: false, error: 'unsupported_mode' })
    return
  }

  const items = await listFigmaCaptions()
  const groups = new Map<string, typeof items>()
  for (const it of items) {
    const h = (it.imageHash ?? '').trim()
    if (!h) continue
    const arr = groups.get(h) ?? []
    arr.push(it)
    groups.set(h, arr)
  }

  let removed = 0
  let duplicates = 0
  for (const arr of groups.values()) {
    if (arr.length <= 1) continue
    duplicates += arr.length - 1
    arr.sort((a, b) => String(b.captionAt ?? '').localeCompare(String(a.captionAt ?? '')))
    const toDelete = arr.slice(1)
    removed += toDelete.length
    if (!dryRun) {
      for (const d of toDelete) {
        await deleteFigmaCaption(d.fileKey)
      }
    }
  }

  res.status(200).json({ success: true, duplicates, removed, dryRun })
})

export default router
