import { Router, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { generateArkImageToImage, isArkImageToImageConfigured } from '../services/arkImageProvider.js'

const router = Router()

const DEFAULT_PROMPTS = {
  element1:
    '主元素：将图1画面中最主要的一个元素提取出来，替换图2下方的奖杯元素。生成图只包含一个元素，不包含背景。生成元素的位置放在画面底部中心位置，生成元素的大小与参考图2的奖杯大小保持完全一致。生成图不包含任何文字，背景为纯黑色。',
  element2:
    '环绕元素：生成一个参考图1中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图1改为参考图2的风格，元素的颜色和材质从参考图2中提取，根据参考图1画面风格自由选择。但不能全部选择参考图1中最主要物品的颜色。除了风格和颜色其余不改变任何东西。背景必须为纯黑色，画面不能出现文字。',
  element3:
    '生成一个参考图2中的元素。生成元素在画布的大小和位置完全遵循图2，绝对不能改变。将参考图2改为参考图1的风格，生成元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择，但至少要选择2种颜色。生成图除了风格，材质和颜色以外其余不改变任何东西。生成元素在画面顶端中心的位置，背景必须为纯黑色，画面不能出现文字',
}

const defaultAssetCache = new Map<string, string>()

function env(name: string, fallback?: string) {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

function envFlag(name: string, fallback: boolean) {
  const v = env(name)
  if (!v) return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

const COMFYUI_ENDPOINT = env('COMFYUI_ENDPOINT') || env('VITE_COMFYUI_ENDPOINT') || 'http://127.0.0.1:8188'
const CUTOUT_ENABLED = envFlag('AVATARFRAME_CUTOUT', true)
const CUTOUT_MODEL = env('COMFYUI_RMBG_MODEL', 'RMBG-2.0')
const CUTOUT_PROCESS_RES = Number(env('COMFYUI_RMBG_PROCESS_RES', '1024'))

function toComfyUrl(pathname: string) {
  return `${COMFYUI_ENDPOINT.replace(/\/+$/, '')}${pathname}`
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string) {
  const b64 = Buffer.from(bytes).toString('base64')
  return `data:${contentType};base64,${b64}`
}

function dataUrlToBytes(dataUrl: string) {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
  if (!m?.[1]) throw new Error('invalid_data_url')
  return Buffer.from(m[1], 'base64')
}

async function uploadToComfyUi(imageBytes: Uint8Array) {
  const form = new FormData()
  const blob = new Blob([imageBytes], { type: 'image/png' })
  form.append('image', blob, 'input.png')
  form.append('type', 'input')
  form.append('overwrite', 'true')
  const res = await fetch(toComfyUrl('/upload/image'), { method: 'POST', body: form })
  if (!res.ok) throw new Error(`comfyui_upload_${res.status}`)
  const json = (await res.json()) as { name?: string; subfolder?: string; type?: string }
  if (!json?.name) throw new Error('comfyui_upload_missing_name')
  return json
}

async function queuePrompt(prompt: Record<string, unknown>) {
  const res = await fetch(toComfyUrl('/prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error(`comfyui_prompt_${res.status}`)
  const json = (await res.json()) as { prompt_id?: string }
  if (!json?.prompt_id) throw new Error('comfyui_prompt_missing_id')
  return json.prompt_id
}

function pickFirstImageRef(node: unknown): { filename: string; subfolder?: string; type?: string } | null {
  if (!node || typeof node !== 'object') return null
  const rec = node as Record<string, unknown>
  if (Array.isArray(rec.images) && rec.images[0] && typeof rec.images[0] === 'object') {
    const img = rec.images[0] as Record<string, unknown>
    const filename = typeof img.filename === 'string' ? img.filename : ''
    if (!filename) return null
    const subfolder = typeof img.subfolder === 'string' ? img.subfolder : undefined
    const type = typeof img.type === 'string' ? img.type : undefined
    return { filename, subfolder, type }
  }
  for (const v of Object.values(rec)) {
    const found = pickFirstImageRef(v)
    if (found) return found
  }
  return null
}

async function waitForHistory(promptId: string, timeoutMs = 120000, intervalMs = 650) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(toComfyUrl(`/history/${promptId}`))
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>
      const entry = json?.[promptId]
      const picked = pickFirstImageRef(entry)
      if (picked) return picked
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('comfyui_timeout')
}

async function fetchViewImage(ref: { filename: string; subfolder?: string; type?: string }) {
  const q = new URLSearchParams({ filename: ref.filename, type: ref.type || 'output' })
  if (ref.subfolder) q.set('subfolder', ref.subfolder)
  const res = await fetch(toComfyUrl(`/view?${q.toString()}`))
  if (!res.ok) throw new Error(`comfyui_view_${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function cutoutWithComfyUiRmbg(inputDataUrl: string) {
  const bytes = dataUrlToBytes(inputDataUrl)
  const uploaded = await uploadToComfyUi(bytes)
  const imageInput = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name
  const prompt = {
    '1': { class_type: 'LoadImage', inputs: { image: imageInput } },
    '2': {
      class_type: 'RMBG',
      inputs: {
        image: ['1', 0],
        model: CUTOUT_MODEL,
        sensitivity: 1.0,
        process_res: CUTOUT_PROCESS_RES,
        mask_blur: 0,
        mask_offset: 0,
        invert_output: false,
        refine_foreground: false,
        background: 'Alpha',
        background_color: '#00000000',
      },
    },
    '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: 'avatar_frame_rmbg' } },
  }
  const promptId = await queuePrompt(prompt)
  const imageRef = await waitForHistory(promptId)
  const outBytes = await fetchViewImage(imageRef)
  return bytesToDataUrl(outBytes, 'image/png')
}

async function readDefaultAssetDataUrl(name: string): Promise<string | null> {
  const cached = defaultAssetCache.get(name)
  if (cached) return cached
  try {
    const root = path.resolve(process.cwd(), '..', 'banner-expand-tool', 'public', 'avatar-frame-defaults')
    const filePath = path.join(root, `${name}.png`)
    const buf = await readFile(filePath)
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
    defaultAssetCache.set(name, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const body: unknown = req.body
  const kvPngDataUrl =
    typeof body === 'object' && body !== null && 'kvPngDataUrl' in body && typeof (body as { kvPngDataUrl?: unknown }).kvPngDataUrl === 'string'
      ? (body as { kvPngDataUrl: string }).kvPngDataUrl
      : ''
  const prompts =
    typeof body === 'object' && body !== null && 'prompts' in body && typeof (body as { prompts?: unknown }).prompts === 'object'
      ? ((body as { prompts?: unknown }).prompts as unknown)
      : null

  if (!kvPngDataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'missing_kvPngDataUrl' })
    return
  }

  if (!isArkImageToImageConfigured()) {
    res.status(400).json({ error: 'ark_i2i_not_configured' })
    return
  }

  const prompt1 =
    typeof prompts === 'object' &&
    prompts !== null &&
    'element1' in prompts &&
    typeof (prompts as { element1?: unknown }).element1 === 'string' &&
    (prompts as { element1: string }).element1.trim()
      ? (prompts as { element1: string }).element1.trim()
      : DEFAULT_PROMPTS.element1
  const prompt2 =
    typeof prompts === 'object' &&
    prompts !== null &&
    'element2' in prompts &&
    typeof (prompts as { element2?: unknown }).element2 === 'string' &&
    (prompts as { element2: string }).element2.trim()
      ? (prompts as { element2: string }).element2.trim()
      : DEFAULT_PROMPTS.element2
  const prompt3 =
    typeof prompts === 'object' &&
    prompts !== null &&
    'element3' in prompts &&
    typeof (prompts as { element3?: unknown }).element3 === 'string' &&
    (prompts as { element3: string }).element3.trim()
      ? (prompts as { element3: string }).element3.trim()
      : DEFAULT_PROMPTS.element3

  const sizeHint = 'square_hd' as const

  try {
    const base1 = await readDefaultAssetDataUrl('main')
    const base2 = await readDefaultAssetDataUrl('surround')
    const base3 = await readDefaultAssetDataUrl('top')

    const img1 = await generateArkImageToImage({
      prompt: prompt1,
      size: sizeHint,
      images: base1 ? [kvPngDataUrl, base1] : [kvPngDataUrl],
    })
    const img2 = await generateArkImageToImage({
      prompt: prompt2,
      size: sizeHint,
      images: base2 ? [kvPngDataUrl, base2] : [kvPngDataUrl],
    })
    const img3 = await generateArkImageToImage({
      prompt: prompt3,
      size: sizeHint,
      images: base3 ? [kvPngDataUrl, base3] : [kvPngDataUrl],
    })

    const element1Raw = bytesToDataUrl(img1.bytes, img1.contentType)
    const element2Raw = bytesToDataUrl(img2.bytes, img2.contentType)
    const element3Raw = bytesToDataUrl(img3.bytes, img3.contentType)

    const element1DataUrl = CUTOUT_ENABLED ? await cutoutWithComfyUiRmbg(element1Raw) : element1Raw
    const element2DataUrl = CUTOUT_ENABLED ? await cutoutWithComfyUiRmbg(element2Raw) : element2Raw
    const element3DataUrl = CUTOUT_ENABLED ? await cutoutWithComfyUiRmbg(element3Raw) : element3Raw

    const compositeDataUrl = kvPngDataUrl

    res.status(200).json({
      element1DataUrl,
      element2DataUrl,
      element3DataUrl,
      compositeDataUrl,
      warnings: ['composite_is_kv_png_only'],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
})

export default router
