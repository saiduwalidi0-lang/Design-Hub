import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { DesignTask } from '../types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'data')
const dataFile = path.join(dataDir, 'tasks.json')

type Persisted = {
  tasks: Record<string, DesignTask>
}

let memory: Persisted | null = null
let writing: Promise<void> | null = null

async function ensureLoaded(): Promise<Persisted> {
  if (memory) return memory

  await fs.mkdir(dataDir, { recursive: true })

  try {
    const raw = await fs.readFile(dataFile, 'utf8')
    const parsed = JSON.parse(raw) as Persisted
    memory = parsed?.tasks ? parsed : { tasks: {} }
  } catch {
    memory = { tasks: {} }
    await fs.writeFile(dataFile, JSON.stringify(memory, null, 2), 'utf8')
  }

  return memory
}

async function flush(): Promise<void> {
  const current = await ensureLoaded()
  const run = async () => {
    await fs.writeFile(dataFile, JSON.stringify(current, null, 2), 'utf8')
  }

  writing = (writing ?? Promise.resolve()).then(run).finally(() => {
    writing = null
  })

  await writing
}

export async function createTask(task: DesignTask): Promise<void> {
  const current = await ensureLoaded()
  current.tasks[task.id] = task
  void flush()
}

export async function updateTask(
  id: string,
  patch: Partial<DesignTask>,
): Promise<DesignTask | null> {
  const current = await ensureLoaded()
  const prev = current.tasks[id]
  if (!prev) return null

  const next: DesignTask = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  current.tasks[id] = next
  void flush()
  return next
}

export async function getTask(id: string): Promise<DesignTask | null> {
  const current = await ensureLoaded()
  return current.tasks[id] ?? null
}

export async function failTaskIfStale(
  id: string,
  input?: { staleAfterMs?: number },
): Promise<DesignTask | null> {
  const envMs = Number(process.env.TASK_STALE_AFTER_MS ?? '')
  const defaultMs = Number.isFinite(envMs) && envMs > 0 ? envMs : 600_000
  const staleAfterMs = Math.max(5_000, input?.staleAfterMs ?? defaultMs)
  const current = await ensureLoaded()
  const t = current.tasks[id]
  if (!t) return null
  if (t.status !== 'running' && t.status !== 'queued') return t

  const updatedAt = new Date(t.updatedAt).getTime()
  if (!Number.isFinite(updatedAt)) return t
  if (Date.now() - updatedAt < staleAfterMs) return t

  const next: DesignTask = {
    ...t,
    status: 'failed',
    stage: undefined,
    errorMessage:
      t.errorMessage ??
      '任务在运行中被中断（可能是服务重启或网络异常），请重试',
    updatedAt: new Date().toISOString(),
  }

  current.tasks[id] = next
  void flush()
  return next
}

export async function sweepStaleTasks(input?: {
  staleAfterMs?: number
}): Promise<{ scanned: number; updated: number }> {
  const envMs = Number(process.env.TASK_STALE_AFTER_MS ?? '')
  const defaultMs = Number.isFinite(envMs) && envMs > 0 ? envMs : 600_000
  const staleAfterMs = Math.max(5_000, input?.staleAfterMs ?? defaultMs)
  const current = await ensureLoaded()
  const now = Date.now()

  const tasks = Object.values(current.tasks)
  let updated = 0

  for (const t of tasks) {
    if (t.status !== 'running' && t.status !== 'queued') continue
    const updatedAt = new Date(t.updatedAt).getTime()
    if (!Number.isFinite(updatedAt)) continue
    if (now - updatedAt < staleAfterMs) continue

    current.tasks[t.id] = {
      ...t,
      status: 'failed',
      stage: undefined,
      errorMessage:
        t.errorMessage ??
        '任务在运行中被中断（可能是服务重启或网络异常），请重试',
      updatedAt: new Date().toISOString(),
    }
    updated += 1
  }

  if (updated > 0) void flush()
  return { scanned: tasks.length, updated }
}
