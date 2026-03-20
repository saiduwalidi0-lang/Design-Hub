import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash, randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'data', 'assets')

function parseDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m?.[1] || !m[2]) return null
  const contentType = m[1].trim() || 'image/jpeg'
  const buf = Buffer.from(m[2].trim(), 'base64')
  return { contentType, bytes: new Uint8Array(buf) }
}

export async function saveImageDataUrl(input: {
  dataUrl: string
  prefix: string
}): Promise<{ name: string; sha256: string; contentType: string; bytes: Uint8Array } | null> {
  const parsed = parseDataUrl(input.dataUrl)
  if (!parsed) return null
  if (!parsed.contentType.startsWith('image/')) return null
  if (parsed.bytes.byteLength <= 0) return null
  if (parsed.bytes.byteLength > 6_000_000) return null

  const sha256 = createHash('sha256').update(parsed.bytes).digest('hex')
  const ext = parsed.contentType.includes('png') ? 'png' : 'jpg'
  const name = `${input.prefix}-${randomUUID()}-${sha256.slice(0, 10)}.${ext}`

  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, name), parsed.bytes)
  return { name, sha256, contentType: parsed.contentType, bytes: parsed.bytes }
}

export async function saveImageBytes(input: {
  bytes: Uint8Array
  contentType: string
  prefix: string
}): Promise<{ name: string; sha256: string; contentType: string; bytes: Uint8Array } | null> {
  if (!input.contentType.startsWith('image/')) return null
  if (input.bytes.byteLength <= 0) return null
  if (input.bytes.byteLength > 10_000_000) return null

  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const ext = input.contentType.includes('png') ? 'png' : 'jpg'
  const name = `${input.prefix}-${randomUUID()}-${sha256.slice(0, 10)}.${ext}`

  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, name), input.bytes)
  return { name, sha256, contentType: input.contentType, bytes: input.bytes }
}
