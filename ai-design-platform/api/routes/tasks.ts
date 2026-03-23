import { Router, type Request, type Response } from 'express'
import type { CreateTaskInput } from '../types.js'
import { enqueueTask } from '../services/taskRunner.js'
import { failTaskIfStale, getTask } from '../services/tasksStore.js'

const router = Router()

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<CreateTaskInput>
  const requirementText = (body.requirementText ?? '').trim()
  const styleHint = (body.styleHint ?? '').trim() || undefined
  const imageCount = Number(body.imageCount ?? 6)
  const mode = body.mode === 'revise' ? 'revise' : body.mode === 'generate' ? 'generate' : undefined
  const referenceUrls = Array.isArray(body.referenceUrls)
    ? body.referenceUrls
        .map((u) => String(u).trim())
        .filter((u) => u.startsWith('http://') || u.startsWith('https://'))
        .slice(0, 12)
    : undefined

  const referenceImageDataUrls = Array.isArray(body.referenceImageDataUrls)
    ? body.referenceImageDataUrls
        .map((x) => String(x))
        .filter((x) => x.startsWith('data:image/'))
        .slice(0, 3)
    : undefined

  if (!requirementText) {
    res.status(400).json({ success: false, error: 'requirementText is required' })
    return
  }

  const safeCount = Number.isFinite(imageCount)
    ? Math.max(3, Math.min(12, Math.floor(imageCount)))
    : 6

  const taskId = await enqueueTask({
    requirementText,
    styleHint,
    imageCount: safeCount,
    referenceUrls,
    mode,
    referenceImageDataUrls,
  })

  res.status(200).json({ success: true, taskId })
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || '').trim()
  const task = await failTaskIfStale(id)
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  res.status(200).json({ success: true, task })
})

export default router
