/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import aiRoutes from './routes/ai.js'
import feishuRoutes from './routes/feishu.js'
import feishuWikiRoutes from './routes/feishuWiki.js'
import feishuDocxRoutes from './routes/feishuDocx.js'
import taskRoutes from './routes/tasks.js'
import visionRoutes from './routes/vision.js'
import assetsRoutes from './routes/assets.js'
import kvRoutes from './routes/kv.js'
import figmaRoutes from './routes/figma.js'
import cmsRoutes from './routes/cms.js'
import avatarFrameRoutes from './routes/avatarFrame.js'
import { applyOpenClawEnv } from './services/openclawEnv.js'

// load env
dotenv.config()
dotenv.config({ path: '.env.local', override: true })
applyOpenClawEnv()

function envFlag(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())
}

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)
if (envFlag('FEISHU_ENABLE')) {
  app.use('/api/feishu', feishuRoutes)
  app.use('/api/feishu', feishuWikiRoutes)
  app.use('/api/feishu/docx', feishuDocxRoutes)
}
app.use('/api/tasks', taskRoutes)
app.use('/api/vision', visionRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/kv', kvRoutes)
app.use('/api/avatar-frame', avatarFrameRoutes)
app.use('/api/figma', figmaRoutes)
app.use('/api/cms', cmsRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  void error
  void req
  void next
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
