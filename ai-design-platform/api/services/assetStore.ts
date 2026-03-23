import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'data', 'assets')

function extFromContentType(ct?: string): string {
  const v = (ct || '').toLowerCase()
  if (v.includes('png')) return '.png'
  if (v.includes('jpeg') || v.includes('jpg')) return '.jpg'
  if (v.includes('webp')) return '.webp'
  return '.bin'
}

export async function ensureAssetFile(input: {
  nameBase: string
  bytes: Uint8Array
  contentType?: string
}): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true })
  const safeBase = input.nameBase.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'asset'
  const ext = extFromContentType(input.contentType)
  const name = `${safeBase}${ext}`
  const filePath = path.join(dataDir, name)
  try {
    await fs.access(filePath)
    return name
  } catch {
    await fs.writeFile(filePath, Buffer.from(input.bytes))
    return name
  }
}

