import { Router, type Request, type Response } from 'express'
import { getTask } from '../services/tasksStore.js'
import { appendMarkdownAsPlainText, createDocx, getDocx } from '../services/feishuDocx.js'

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

function pickTitleFromMarkdown(md: string): string {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith('# ')) return t.replace(/^#\s+/, '').slice(0, 80)
  }
  return 'Design Plan'
}

const router = Router()

router.post('/create_from_task', async (req: Request, res: Response): Promise<void> => {
  if (!allowAdmin(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }

  const body = req.body as any
  const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : ''
  const folderToken = typeof body?.folderToken === 'string' ? body.folderToken.trim() : undefined

  if (!taskId) {
    res.status(400).json({ success: false, error: 'missing_task_id' })
    return
  }

  const task = await getTask(taskId)
  if (!task) {
    res.status(404).json({ success: false, error: 'task_not_found' })
    return
  }
  if (!task.designSpecMarkdown?.trim()) {
    res.status(400).json({ success: false, error: 'missing_design_spec' })
    return
  }

  const title = typeof body?.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, 80)
    : pickTitleFromMarkdown(task.designSpecMarkdown)

  try {
    const created = await createDocx({ title, folderToken })
    const info = created.blockId ? { blockId: created.blockId } : await getDocx({ documentId: created.documentId })
    const blockId = info.blockId ?? created.documentId

    const write = await appendMarkdownAsPlainText({
      documentId: created.documentId,
      blockId,
      markdown: task.designSpecMarkdown,
    })

    res.status(200).json({
      success: true,
      documentId: created.documentId,
      url: created.url,
      written: write.written,
      writeError: write.error,
    })
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e)
    const m = msg.match(/https?:\/\/open\.feishu\.cn\/app\/[^\s]+\/auth\?[^\s]+/)
    const authUrl = m ? m[0] : undefined
    const scopes = (() => {
      if (!authUrl) return undefined
      try {
        const u = new URL(authUrl)
        const q = u.searchParams.get('q')
        if (!q) return undefined
        return q.split(',').map((s) => s.trim()).filter(Boolean)
      } catch {
        return undefined
      }
    })()

    res.status(200).json({
      success: false,
      error: msg,
      authUrl,
      requiredScopes: scopes,
    })
  }
})

export default router
