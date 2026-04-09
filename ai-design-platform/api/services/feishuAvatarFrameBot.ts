import { replyImageMessage, replyTextMessage, uploadImageFromBytes } from './feishu.js'
import { composeAvatarFrameLvPreviews } from './avatarFrameLevelPreviews.js'

/** 与 Figma / banner-expand-tool L 档一致，供服务端 Ark 出图与 composite */
const AVATAR_FRAME_SPEC_L = {
  level: 'L' as const,
  figmaFrame: { width: 270, height: 270 },
  targetFrame: { width: 1024, height: 1024 },
  boxes: {
    element1: { x: 87, y: 171, width: 96, height: 96, align: 'bottomCenter' as const },
    element2: { x: 15, y: 171, width: 240, height: 96, align: 'center' as const },
    element3: { x: 75, y: 3, width: 120, height: 42, align: 'topCenter' as const },
  },
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function envFlag(name: string): boolean {
  const v = env(name)
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

/** 开启后：纯图片（或纯图 post）走头像框生成，不再走「识别图 + 开始生成」工作流 */
export function isFeishuAvatarFrameImageModeEnabled(): boolean {
  return envFlag('FEISHU_AVATAR_FRAME_IMAGE_MODE')
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  const mime = contentType.split(';')[0].trim() || 'image/png'
  const b64 = Buffer.from(bytes).toString('base64')
  return `data:${mime};base64,${b64}`
}

function parseDataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s)
  if (!m?.[2]) throw new Error('invalid_image_data_url')
  return {
    bytes: Uint8Array.from(Buffer.from(m[2], 'base64')),
    contentType: (m[1] || 'image/png').trim(),
  }
}

function avatarFrameApiBaseUrl(): string {
  const explicit = env('AVATAR_FRAME_API_BASE_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  const port = env('PORT') || env('API_PORT') || '3002'
  return `http://127.0.0.1:${port}`
}

export async function callAvatarFrameGenerateApi(kvDataUrl: string): Promise<{
  element1DataUrl: string
  element2DataUrl: string
  element3DataUrl: string
}> {
  const url = `${avatarFrameApiBaseUrl()}/api/avatar-frame/generate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kvPngDataUrl: kvDataUrl,
      spec: AVATAR_FRAME_SPEC_L,
      kvJson: { source: 'feishu_avatar_frame_bot', at: Date.now() },
    }),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const err = typeof data?.error === 'string' ? data.error : `http_${res.status}`
    throw new Error(err)
  }
  const e1 = data?.element1DataUrl
  const e2 = data?.element2DataUrl
  const e3 = data?.element3DataUrl
  if (typeof e1 !== 'string' || typeof e2 !== 'string' || typeof e3 !== 'string') {
    throw new Error('invalid_avatar_frame_response')
  }
  return { element1DataUrl: e1, element2DataUrl: e2, element3DataUrl: e3 }
}

export async function feishuReplyAvatarFrameResult(input: {
  messageId: string
  kvBytes: Uint8Array
  contentType: string
}): Promise<void> {
  const { messageId } = input
  const kvDataUrl = bytesToDataUrl(input.kvBytes, input.contentType)
  await replyTextMessage({
    messageId,
    text: '已收到图片，正在生成头像框（LV1 / LV2 / LV3 三档预览），请稍候…',
  }).catch(() => {})

  let elements: Awaited<ReturnType<typeof callAvatarFrameGenerateApi>>
  try {
    elements = await callAvatarFrameGenerateApi(kvDataUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await replyTextMessage({
      messageId,
      text: [
        '头像框生成失败：',
        msg,
        '',
        '请确认：',
        '1）头像框 API 可访问（默认同机 ' + avatarFrameApiBaseUrl() + '，可用环境变量 AVATAR_FRAME_API_BASE_URL 覆盖）',
        '2）已配置 Ark 图生图，或开发环境下允许 mock',
        '3）如需抠图，rmbg-local-server 已启动（见 AVATARFRAME_CUTOUT）',
      ].join('\n'),
    }).catch(() => {})
    return
  }

  let previews: ReturnType<typeof composeAvatarFrameLvPreviews>
  try {
    previews = composeAvatarFrameLvPreviews(elements)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await replyTextMessage({
      messageId,
      text: `三档预览合成失败：${msg}`,
    }).catch(() => {})
    return
  }

  const order = [
    { key: 'lv1' as const, label: 'LV1（S 档）', file: 'avatar_lv1.png' },
    { key: 'lv2' as const, label: 'LV2（M 档）', file: 'avatar_lv2.png' },
    { key: 'lv3' as const, label: 'LV3（L 档，含顶饰）', file: 'avatar_lv3.png' },
  ] as const

  await replyTextMessage({
    messageId,
    text: '生成完成：以下连续 3 张为交付预览（1024×1024，与 Figma 三档框位一致）— LV1 → LV2 → LV3。',
  }).catch(() => {})

  for (const item of order) {
    const dataUrl = previews[item.key]
    let bytes: Uint8Array
    let ct: string
    try {
      ;({ bytes, contentType: ct } = parseDataUrlToBytes(dataUrl))
    } catch {
      await replyTextMessage({ messageId, text: `${item.label} 解析失败，跳过。` }).catch(() => {})
      continue
    }
    const up = await uploadImageFromBytes({
      bytes,
      filename: item.file,
      contentType: ct,
    }).catch(() => null)
    if (!up?.imageKey) {
      await replyTextMessage({ messageId, text: `${item.label} 上传到飞书失败，跳过。` }).catch(() => {})
      continue
    }
    await replyImageMessage({ messageId, imageKey: up.imageKey }).catch(() => {})
  }
}
