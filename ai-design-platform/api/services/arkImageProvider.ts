import { createHash } from 'node:crypto'
import type { KvImageSize } from './kvImage.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

/** 与官方 curl 一致：仅填 ARK_API_KEY 时可省略 MODEL / BASE_URL / SIZE 等（图生图默认值见下） */
const DEFAULT_VOLC_ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3'

/** 图生图（i2i）未配置环境变量时的默认，对齐 `images/generations` 常用参数 */
const DEFAULT_I2I_MODEL = 'doubao-seedream-5-0-260128'
const DEFAULT_I2I_SIZE = '2K'

function normalizeBaseUrl(baseUrl: string): string {
  const u = baseUrl.replace(/\/+$/, '')
  if (u.endsWith('/images/generations')) return u
  if (u.endsWith('/api/v3')) return `${u}/images/generations`
  return `${u}/images/generations`
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = env(name)
  if (!v) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

type ArkMode = 't2i' | 'i2i'

type ArkConfig = {
  apiKey: string
  model: string
  url: string
  size: string
  responseFormat: string
  sequentialImageGeneration: string
  watermark: boolean
  stream: boolean
  imageField?: string
  imageSource?: 'base64' | 'url'
}

function mapSize(size: KvImageSize): string {
  switch (size) {
    case 'square_hd':
      return '1024x1024'
    case 'square':
      return '768x768'
    case 'portrait_4_3':
      return '768x1024'
    case 'portrait_16_9':
      return '576x1024'
    case 'landscape_4_3':
      return '1024x768'
    case 'landscape_16_9':
      return '1024x576'
    default:
      return '1024x1024'
  }
}

function getConfig(mode: ArkMode, sizeHint: KvImageSize): ArkConfig {
  const prefix = mode === 't2i' ? 'ARK_T2I_' : 'ARK_I2I_'

  const apiKey = env(`${prefix}API_KEY`) ?? env('ARK_IMAGE_API_KEY') ?? env('ARK_API_KEY')
  const model =
    env(`${prefix}MODEL`) ??
    env('ARK_IMAGE_MODEL') ??
    env('ARK_MODEL') ??
    (mode === 'i2i' ? DEFAULT_I2I_MODEL : undefined)
  let base = env(`${prefix}BASE_URL`) ?? env('ARK_IMAGE_BASE_URL') ?? env('ARK_BASE_URL')
  if (!base && apiKey && model) base = DEFAULT_VOLC_ARK_BASE
  if (!apiKey || !model || !base) throw new Error('ark_image_missing_env')

  const url = normalizeBaseUrl(base)
  const configuredSize = env(`${prefix}SIZE`) ?? env('ARK_IMAGE_SIZE')
  const size =
    configuredSize && configuredSize.trim()
      ? configuredSize.trim()
      : mode === 'i2i'
        ? DEFAULT_I2I_SIZE
        : mapSize(sizeHint)

  const responseFormat = (env(`${prefix}RESPONSE_FORMAT`) ?? env('ARK_IMAGE_RESPONSE_FORMAT') ?? 'url').trim()
  const sequentialImageGeneration = (env(`${prefix}SEQUENTIAL`) ?? env('ARK_IMAGE_SEQUENTIAL') ?? 'disabled').trim()
  const watermark = envFlag(`${prefix}WATERMARK`, envFlag('ARK_IMAGE_WATERMARK', true))
  const stream = envFlag(`${prefix}STREAM`, envFlag('ARK_IMAGE_STREAM', false))

  const imageField = (env(`${prefix}IMAGE_FIELD`) ?? '').trim() || undefined
  const imageSourceRaw = (env(`${prefix}IMAGE_SOURCE`) ?? '').trim().toLowerCase()
  const imageSource = imageSourceRaw === 'url' ? 'url' : imageSourceRaw === 'base64' ? 'base64' : undefined

  return {
    apiKey,
    model,
    url,
    size,
    responseFormat,
    sequentialImageGeneration,
    watermark,
    stream,
    imageField,
    imageSource,
  }
}

function stripDataUrlToB64(dataUrl: string): string | null {
  const m = dataUrl.trim().match(/^data:image\/[^;]+;base64,(.+)$/)
  return m?.[1]?.trim() ? m[1].trim() : null
}

async function decodeResult(json: any): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const b64 = json?.data?.[0]?.b64_json
  const urlOut = json?.data?.[0]?.url

  if (typeof b64 === 'string' && b64.trim()) {
    const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    return { bytes, contentType: 'image/png', sha256 }
  }

  if (typeof urlOut === 'string' && urlOut.trim()) {
    const imgRes = await fetch(urlOut)
    if (!imgRes.ok) throw new Error(`ark_image_url_fetch_${imgRes.status}`)
    const ab = await imgRes.arrayBuffer()
    const bytes = new Uint8Array(ab)
    const contentType = imgRes.headers.get('content-type') || 'image/png'
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    return { bytes, contentType, sha256 }
  }

  throw new Error('ark_image_bad_response')
}

async function requestArkImage(cfg: ArkConfig, body: any): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || json?.msg || 'unknown'
    throw new Error(`ark_image_http_${res.status}_${msg}`)
  }

  return await decodeResult(json)
}

function hasResolvedArkTriple(mode: ArkMode): boolean {
  const prefix = mode === 't2i' ? 'ARK_T2I_' : 'ARK_I2I_'
  const apiKey = env(`${prefix}API_KEY`) ?? env('ARK_IMAGE_API_KEY') ?? env('ARK_API_KEY')
  const model =
    env(`${prefix}MODEL`) ??
    env('ARK_IMAGE_MODEL') ??
    env('ARK_MODEL') ??
    (mode === 'i2i' ? DEFAULT_I2I_MODEL : undefined)
  let base = env(`${prefix}BASE_URL`) ?? env('ARK_IMAGE_BASE_URL') ?? env('ARK_BASE_URL')
  if (!base && apiKey && model) base = DEFAULT_VOLC_ARK_BASE
  return Boolean(apiKey && model && base)
}

export function isArkTextToImageConfigured(): boolean {
  return hasResolvedArkTriple('t2i')
}

export function isArkImageToImageConfigured(): boolean {
  return hasResolvedArkTriple('i2i')
}

export function isArkImageConfigured(): boolean {
  return isArkTextToImageConfigured()
}

export async function generateArkTextToImage(input: {
  prompt: string
  size: KvImageSize
}): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const cfg = getConfig('t2i', input.size)
  return await requestArkImage(cfg, {
    model: cfg.model,
    prompt: input.prompt,
    sequential_image_generation: cfg.sequentialImageGeneration,
    response_format: cfg.responseFormat,
    size: cfg.size,
    stream: cfg.stream,
    watermark: cfg.watermark,
    n: 1,
  })
}

export async function generateArkImageToImage(input: {
  prompt: string
  size: KvImageSize
  images: string[]
}): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const cfg = getConfig('i2i', input.size)
  const field = cfg.imageField || 'image'
  const source = cfg.imageSource || 'base64'

  const imagePayload: string[] = []
  for (const img of input.images) {
    const s = String(img || '').trim()
    if (!s) continue
    if (s.startsWith('http://') || s.startsWith('https://')) {
      imagePayload.push(s)
      continue
    }
    if (source === 'base64') {
      if (s.startsWith('data:image/')) {
        imagePayload.push(s)
        continue
      }
      const b64 = stripDataUrlToB64(s)
      if (b64) {
        imagePayload.push(`data:image/png;base64,${b64}`)
      }
    }
  }

  return await requestArkImage(cfg, {
    model: cfg.model,
    prompt: input.prompt,
    [field]: imagePayload,
    sequential_image_generation: cfg.sequentialImageGeneration,
    response_format: cfg.responseFormat,
    size: cfg.size,
    stream: cfg.stream,
    watermark: cfg.watermark,
    n: 1,
  })
}

export async function generateArkImage(input: {
  prompt: string
  size: KvImageSize
}): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  return await generateArkTextToImage(input)
}
