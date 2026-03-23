import { Router, type Request, type Response } from 'express'
import { createWikiSpace, getDefaultSpaceName } from '../services/feishuWiki.js'

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

const router = Router()

router.post('/wiki/create_space', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }

  const body = req.body as any

  const name = typeof body?.name === 'string' && body.name.trim()
    ? body.name.trim()
    : getDefaultSpaceName()
  const description = typeof body?.description === 'string' ? body.description : undefined

  const space = await createWikiSpace({ name, description })
  res.status(200).json({
    success: true,
    space,
  })
})

export default router
