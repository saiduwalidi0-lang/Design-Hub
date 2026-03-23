import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

type CaptionItem = {
  fileKey: string
  fileName: string
  projectName?: string
  fileUrl: string
  thumbnailUrl?: string
  lastModified?: string
  imageHash?: string
  caption: string
  captionAt: string
}

type Persisted = {
  items: Record<string, CaptionItem>
}

function isBogusCaption(caption: string): boolean {
  const t = caption.trim()
  if (!t) return true
  const hits = ['请你提供', '请提供', '无法查看', '看不到', '未收到', '没有收到']
  const targets = ['图片', '缩略图', '设计稿', '内容描述']
  const enHits = ['please provide', 'cannot see', "can't see", 'unable to view', 'no image', 'did not receive']
  const enTargets = ['image', 'thumbnail', 'screenshot', 'design']
  const tLower = t.toLowerCase()
  return (
    (hits.some((h) => t.includes(h)) && targets.some((k) => t.includes(k))) ||
    (enHits.some((h) => tLower.includes(h)) && enTargets.some((k) => tLower.includes(k)))
  )
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'data')
const dataFile = path.join(dataDir, 'figma_captions.json')

let memory: Persisted | null = null
let writing: Promise<void> | null = null

async function ensureLoaded(): Promise<Persisted> {
  if (memory) return memory

  await fs.mkdir(dataDir, { recursive: true })
  try {
    const raw = await fs.readFile(dataFile, 'utf8')
    const parsed = JSON.parse(raw) as Persisted
    memory = parsed?.items ? parsed : { items: {} }
  } catch {
    memory = { items: {} }
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

export async function getFigmaCaption(fileKey: string): Promise<CaptionItem | null> {
  const current = await ensureLoaded()
  const item = current.items[fileKey] ?? null
  if (!item) return null
  if (isBogusCaption(item.caption)) {
    delete current.items[fileKey]
    void flush()
    return null
  }
  return item
}

export async function upsertFigmaCaption(item: CaptionItem): Promise<void> {
  const current = await ensureLoaded()
  current.items[item.fileKey] = item
  void flush()
}

export async function deleteFigmaCaption(fileKey: string): Promise<boolean> {
  const current = await ensureLoaded()
  if (!current.items[fileKey]) return false
  delete current.items[fileKey]
  void flush()
  return true
}

export async function listFigmaCaptions(): Promise<CaptionItem[]> {
  const current = await ensureLoaded()
  return Object.values(current.items)
}

export async function findFigmaCaptionByImageHash(hash: string): Promise<CaptionItem | null> {
  const h = (hash || '').trim()
  if (!h) return null
  const current = await ensureLoaded()
  for (const item of Object.values(current.items)) {
    if (item.imageHash && item.imageHash === h && item.caption && !isBogusCaption(item.caption)) return item
  }
  return null
}
