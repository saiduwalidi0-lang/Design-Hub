import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export type FigmaIndexStatus = {
  running: boolean
  startedAt?: string
  updatedAt?: string
  teamId?: string
  projectTotal?: number
  projectDone?: number
  fileTotal?: number
  fileSeen?: number
  fileAnalyzed?: number
  fileDeduped?: number
  fileSkipped?: number
  fileFailed?: number
  currentProject?: string
  currentFile?: string
  lastError?: string
  finishedAt?: string
}

type Persisted = { status: FigmaIndexStatus }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'data')
const dataFile = path.join(dataDir, 'figma_index.json')

let memory: Persisted | null = null
let writing: Promise<void> | null = null

async function ensureLoaded(): Promise<Persisted> {
  if (memory) return memory
  await fs.mkdir(dataDir, { recursive: true })
  try {
    const raw = await fs.readFile(dataFile, 'utf8')
    const parsed = JSON.parse(raw) as Persisted
    memory = parsed?.status ? parsed : { status: { running: false } }
  } catch {
    memory = { status: { running: false } }
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

export async function getFigmaIndexStatus(): Promise<FigmaIndexStatus> {
  const current = await ensureLoaded()
  return current.status
}

export async function setFigmaIndexStatus(patch: Partial<FigmaIndexStatus>): Promise<FigmaIndexStatus> {
  const current = await ensureLoaded()
  const next: FigmaIndexStatus = {
    ...current.status,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  current.status = next
  void flush()
  return next
}
