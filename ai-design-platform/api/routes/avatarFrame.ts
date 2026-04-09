import { Router, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AvatarFrameGenerateRequestBody } from '../contracts/avatarFrameGenerate.js'
import { generateArkImageToImage, isArkImageToImageConfigured } from '../services/arkImageProvider.js'
import { composeAvatarFrameCompositeFromDataUrls, trimTransparentBoundsDataUrl } from '../services/avatarFrameComposite.js'
import { generateAvatarFrameMockFromBody } from '../services/avatarFrameMockGenerate.js'
import { cutoutPngDataUrlWithRmbgLocal } from '../services/rmbgLocalCutout.js'

const router = Router()

/** 与 banner-expand-tool `AvatarFrameEditorPanel` 默认文案一致，保证插件 HTTP 与网页出图风格对齐 */
const DEFAULT_PROMPTS = {
  element1:
    '将图1画面中最主要的一个元素提取出来（不能是标题），如果图片有缺失就将其补全，调小其尺寸，使其与参考图2的奖杯尺寸相似或更小，接着将其替换图2下方的奖杯元素。生成元素在画面的底端中心的位置，背景为纯黑色。',
  element2:
    '生成一个参考图2中的元素。元素在画布的大小和位置完全遵循图2，不能改变。将参考图2改为参考图1的风格，元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择。但不能全部选择参考图2中最主要物品的颜色。除了风格和颜色其余不改变任何东西。背景必须为纯黑色，画面不能出现文字。',
  element3:
    '生成一个参考图2中的元素。生成元素在画布的大小和位置完全遵循图2，绝对不能改变。将参考图2改为参考图1的风格，生成元素的颜色和材质从参考图1中提取，根据参考图2画面风格自由选择，但至少要选择2种颜色。生成图除了风格，材质和颜色以外其余不改变任何东西。生成元素在画面顶端中心的位置，背景必须为纯黑色，画面不能出现文字',
  element4:
    '生成参考图2中的头像框圆环：画布尺寸与圆环整体构图、线条走向及中间留给头像的镂空（透明区域）必须与参考图2完全一致，不得改变形状与透明关系。将参考图2改为参考图1的风格，圆环的颜色与材质从参考图1中提取，根据参考图2结构自由选择用色，但不能全部使用参考图2中最主要物品的颜色。除风格与颜色外，不改变任何轮廓、粗细与透明度分布。圆环外侧与中间头像区域须保持透明，禁止用纯黑或其它不透明色填充镂空。画面不要出现文字。',
}

const DEFAULTS_ROOT = path.resolve(process.cwd(), '..', 'banner-expand-tool', 'public', 'avatar-frame-defaults')

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

/** 默认开：三张 Ark 出图后一律走 rmbg-local-server；设 AVATARFRAME_CUTOUT=0 可关 */
const CUTOUT_ENABLED = envFlag('AVATARFRAME_CUTOUT', true)

function bytesToDataUrl(bytes: Uint8Array, contentType: string) {
  const b64 = Buffer.from(bytes).toString('base64')
  return `data:${contentType};base64,${b64}`
}

function resolveSafeDefaultsFile(relPath: string): string | null {
  const trimmed = relPath.trim().replace(/^[/\\]+/, '')
  if (!trimmed || trimmed.includes('..')) return null
  const normalized = path.normalize(trimmed)
  if (normalized.startsWith('..')) return null
  const full = path.resolve(DEFAULTS_ROOT, normalized)
  const rootWithSep = DEFAULTS_ROOT.endsWith(path.sep) ? DEFAULTS_ROOT : `${DEFAULTS_ROOT}${path.sep}`
  if (full !== DEFAULTS_ROOT && !full.startsWith(rootWithSep)) return null
  return full
}

async function readDefaultTemplateRelative(relPath: string): Promise<string | null> {
  const key = relPath.trim()
  const cacheHit = defaultAssetCache.get(`rel:${key}`)
  if (cacheHit) return cacheHit
  const full = resolveSafeDefaultsFile(key)
  if (!full) return null
  try {
    const buf = await readFile(full)
    const ext = path.extname(full).toLowerCase()
    const mime =
      ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
    defaultAssetCache.set(`rel:${key}`, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

router.get('/default-config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const raw = await readFile(path.join(DEFAULTS_ROOT, 'defaults.json'), 'utf-8')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(200).send(raw)
  } catch {
    res.status(404).json({ error: 'default_config_not_found' })
  }
})

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AvatarFrameGenerateRequestBody | Record<string, unknown>
  const kvPngDataUrl =
    typeof body === 'object' && body !== null && typeof body.kvPngDataUrl === 'string' ? body.kvPngDataUrl : ''
  const prompts = typeof body === 'object' && body !== null && body.prompts && typeof body.prompts === 'object' ? body.prompts : null
  const defaultTemplates =
    typeof body === 'object' &&
    body !== null &&
    body.defaultTemplates &&
    typeof body.defaultTemplates === 'object'
      ? (body.defaultTemplates as Record<string, unknown>)
      : null

  if (!kvPngDataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'missing_kvPngDataUrl' })
    return
  }

  if (!isArkImageToImageConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      res.status(400).json({ error: 'ark_i2i_not_configured' })
      return
    }
    try {
      const out = generateAvatarFrameMockFromBody(body)
      res.status(200).json({
        ...out,
        warnings: ['mock_fallback_configure_ARK_I2I_or_ARK_IMAGE_for_real_ai'],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: msg })
    }
    return
  }

  const prompt1 =
    prompts &&
    typeof prompts === 'object' &&
    'element1' in prompts &&
    typeof (prompts as { element1?: unknown }).element1 === 'string' &&
    (prompts as { element1: string }).element1.trim()
      ? (prompts as { element1: string }).element1.trim()
      : DEFAULT_PROMPTS.element1
  const prompt2 =
    prompts &&
    typeof prompts === 'object' &&
    'element2' in prompts &&
    typeof (prompts as { element2?: unknown }).element2 === 'string' &&
    (prompts as { element2: string }).element2.trim()
      ? (prompts as { element2: string }).element2.trim()
      : DEFAULT_PROMPTS.element2
  const prompt3 =
    prompts &&
    typeof prompts === 'object' &&
    'element3' in prompts &&
    typeof (prompts as { element3?: unknown }).element3 === 'string' &&
    (prompts as { element3: string }).element3.trim()
      ? (prompts as { element3: string }).element3.trim()
      : DEFAULT_PROMPTS.element3

  const sizeHint = 'square_hd' as const

  const rel1 =
    defaultTemplates && typeof defaultTemplates.element1 === 'string' && defaultTemplates.element1.trim()
      ? defaultTemplates.element1.trim()
      : 'main.png'
  const rel2 =
    defaultTemplates && typeof defaultTemplates.element2 === 'string' && defaultTemplates.element2.trim()
      ? defaultTemplates.element2.trim()
      : 'surround.png'
  const rel3 =
    defaultTemplates && typeof defaultTemplates.element3 === 'string' && defaultTemplates.element3.trim()
      ? defaultTemplates.element3.trim()
      : 'top.png'

  try {
    const base1 = await readDefaultTemplateRelative(rel1)
    const base2 = await readDefaultTemplateRelative(rel2)
    const base3 = await readDefaultTemplateRelative(rel3)

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

    const warnings: string[] = []
    if (!CUTOUT_ENABLED) {
      warnings.push('rmbg_cutout_disabled')
    }

    let element1DataUrl: string
    let element2DataUrl: string
    let element3DataUrl: string
    if (CUTOUT_ENABLED) {
      ;[element1DataUrl, element2DataUrl, element3DataUrl] = await Promise.all([
        cutoutPngDataUrlWithRmbgLocal(element1Raw),
        cutoutPngDataUrlWithRmbgLocal(element2Raw),
        cutoutPngDataUrlWithRmbgLocal(element3Raw),
      ])
    } else {
      element1DataUrl = element1Raw
      element2DataUrl = element2Raw
      element3DataUrl = element3Raw
    }

    // 合成前按像素裁切透明边界，避免把整张大透明画布缩放进框位
    element1DataUrl = trimTransparentBoundsDataUrl(element1DataUrl)
    element2DataUrl = trimTransparentBoundsDataUrl(element2DataUrl)
    element3DataUrl = trimTransparentBoundsDataUrl(element3DataUrl)

    let compositeDataUrl = kvPngDataUrl
    try {
      compositeDataUrl = composeAvatarFrameCompositeFromDataUrls({
        element1DataUrl,
        element2DataUrl,
        element3DataUrl,
        spec: body.spec,
      })
    } catch {
      warnings.push('composite_from_elements_failed_fallback_to_kv')
    }

    res.status(200).json({
      element1DataUrl,
      element2DataUrl,
      element3DataUrl,
      compositeDataUrl,
      warnings,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
})

export default router
