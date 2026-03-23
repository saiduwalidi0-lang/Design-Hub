import { Router, type Request, type Response } from 'express'

const router = Router()

router.get('/status', (req: Request, res: Response): void => {
  void req
  const configured = Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY)
  res.status(200).json({
    success: true,
    configured,
    baseUrl: process.env.AI_BASE_URL || null,
    model: process.env.AI_MODEL || 'auto',
  })
})

export default router
