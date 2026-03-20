import { Router, type Request, type Response } from 'express'
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

const router = Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, '..', 'data', 'assets')

router.get('/:name', async (req: Request, res: Response): Promise<void> => {
  const name = String(req.params.name || '')
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    res.status(400).json({ success: false, error: 'invalid_name' })
    return
  }

  const filePath = path.join(dataDir, name)
  try {
    const buf = await fs.readFile(filePath)
    const ext = path.extname(name).toLowerCase()
    const ct =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream'
    res.status(200)
    res.setHeader('content-type', ct)
    res.send(buf)
  } catch {
    res.status(404).json({ success: false, error: 'not_found' })
  }
})

export default router

