import { Router, type Request, type Response } from 'express'
import { analyzeImageWithAI, isAiConfigured } from '../services/aiProvider.js'

const router = Router()

function parseDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m?.[1] || !m[2]) return null
  const contentType = m[1].trim() || 'image/jpeg'
  const b64 = m[2].trim()
  const buf = Buffer.from(b64, 'base64')
  return { contentType, bytes: new Uint8Array(buf) }
}

router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as any
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt : undefined
  if (!dataUrl) {
    res.status(400).json({ success: false, error: 'missing_dataUrl' })
    return
  }

  const parsed = parseDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ success: false, error: 'invalid_dataUrl' })
    return
  }

  if (!isAiConfigured()) {
    res.status(400).json({ success: false, error: 'ai_not_configured' })
    return
  }

  const out = await analyzeImageWithAI({
    bytes: parsed.bytes,
    contentType: parsed.contentType,
    prompt,
  })

  if (!out.text) {
    res.status(500).json({ success: false, error: out.error ?? 'analyze_failed' })
    return
  }

  res.status(200).json({ success: true, text: out.text })
})

export default router

