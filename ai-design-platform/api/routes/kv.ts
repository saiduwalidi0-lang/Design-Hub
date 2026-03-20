import { Router, type Request, type Response } from 'express'
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import {
  generateArkImageToImage,
  generateArkTextToImage,
  isArkImageToImageConfigured,
  isArkTextToImageConfigured,
} from '../services/arkImageProvider.js'
import { saveImageBytes } from '../services/referenceImageStore.js'

const router = Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, '..', 'data', 'assets')

function contentTypeByExt(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

router.post('/render', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as any
  const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
  const imageSize = typeof body?.imageSize === 'string' ? body.imageSize : 'landscape_16_9'
  const referenceAssetName = typeof body?.referenceAssetName === 'string' ? body.referenceAssetName : ''
  const referenceImageDataUrl = typeof body?.referenceImageDataUrl === 'string' ? body.referenceImageDataUrl : ''

  if (!prompt.trim()) {
    res.status(400).json({ success: false, error: 'missing_prompt' })
    return
  }

  if (prompt.length > 8000) {
    res.status(400).json({ success: false, error: 'prompt_too_long' })
    return
  }

  let refDataUrl: string | undefined
  let refPublicUrl: string | undefined
  if (referenceImageDataUrl.startsWith('data:image/')) {
    refDataUrl = referenceImageDataUrl
  } else if (referenceAssetName) {
    if (referenceAssetName.includes('..') || referenceAssetName.includes('/') || referenceAssetName.includes('\\')) {
      res.status(400).json({ success: false, error: 'invalid_reference_asset' })
      return
    }
    try {
      const bytes = await fs.readFile(path.join(dataDir, referenceAssetName))
      const ct = contentTypeByExt(referenceAssetName)
      const b64 = Buffer.from(bytes).toString('base64')
      refDataUrl = `data:${ct};base64,${b64}`
      const base = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
      if (base) refPublicUrl = `${base}/api/assets/${referenceAssetName}`
    } catch {
      res.status(404).json({ success: false, error: 'reference_asset_not_found' })
      return
    }
  }

  const hasRef = Boolean(refDataUrl || refPublicUrl)
  if (hasRef && !isArkImageToImageConfigured()) {
    res.status(400).json({ success: false, error: 'ark_i2i_not_configured' })
    return
  }
  if (!hasRef && !isArkTextToImageConfigured()) {
    res.status(400).json({ success: false, error: 'ark_t2i_not_configured' })
    return
  }

  const preferUrl = (process.env.ARK_I2I_IMAGE_SOURCE ?? '').trim().toLowerCase() === 'url'

  const img = hasRef
    ? await generateArkImageToImage({
        prompt,
        size: imageSize as any,
        images: [preferUrl ? (refPublicUrl || refDataUrl!) : (refDataUrl || refPublicUrl!)],
      }).catch((e: any) => ({ error: e?.message ?? 'generate_failed' }))
    : await generateArkTextToImage({
        prompt,
        size: imageSize as any,
      }).catch((e: any) => ({ error: e?.message ?? 'generate_failed' }))

  if ((img as any).error) {
    res.status(500).json({ success: false, error: (img as any).error })
    return
  }

  const saved = await saveImageBytes({
    bytes: (img as any).bytes,
    contentType: (img as any).contentType,
    prefix: 'kv-render',
  }).catch(() => null)
  if (!saved) {
    res.status(500).json({ success: false, error: 'save_failed' })
    return
  }

  res.status(200).json({ success: true, url: `/api/assets/${saved.name}` })
})

export default router
