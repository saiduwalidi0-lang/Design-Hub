import { createHash } from 'node:crypto'

type TenantTokenCache = {
  token: string
  expiresAt: number
}

let cache: TenantTokenCache | null = null

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

export function getPublicBaseUrl(): string {
  return env('PUBLIC_BASE_URL') ?? 'http://localhost:5174'
}

export function verifyEventToken(body: any): boolean {
  const expected = env('FEISHU_VERIFICATION_TOKEN')
  if (!expected) return true
  const got = body?.header?.token ?? body?.token
  return typeof got === 'string' && got === expected
}

export function parseUserText(content: string): {
  requirementText: string
  styleHint?: string
  imageCount?: number
} {
  const raw = content.trim()
  const lines = raw.split(/\r?\n/).map((l) => l.trim())

  let styleHint: string | undefined
  let imageCount: number | undefined
  const remain: string[] = []

  for (const l of lines) {
    const mStyle = l.match(/^(风格|style)\s*[:：]\s*(.+)$/i)
    if (mStyle?.[2]) {
      styleHint = mStyle[2].trim()
      continue
    }
    const mCount = l.match(/^(数量|张数|images?)\s*[:：]\s*(\d+)$/i)
    if (mCount?.[2]) {
      imageCount = Number(mCount[2])
      continue
    }
    remain.push(l)
  }

  return {
    requirementText: remain.join('\n').trim() || raw,
    styleHint,
    imageCount,
  }
}

export async function getTenantAccessToken(): Promise<string> {
  const now = Date.now()
  if (cache && cache.expiresAt - now > 10_000) return cache.token

  const appId = env('FEISHU_APP_ID')
  const appSecret = env('FEISHU_APP_SECRET')
  if (!appId || !appSecret) throw new Error('missing_feishu_app_credentials')

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })

  const data = (await res.json().catch(() => null)) as any
  if (!res.ok || !data?.tenant_access_token) {
    throw new Error(`feishu_token_failed_${res.status}`)
  }

  const expiresIn = Number(data.expire ?? 3600)
  cache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  }
  return cache.token
}

export async function replyTextMessage(input: {
  messageId: string
  text: string
}): Promise<void> {
  const token = await getTenantAccessToken()
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text: input.text }),
    }),
  })

  if (!res.ok) {
    throw new Error(`feishu_reply_failed_${res.status}`)
  }
}

export async function replyImageMessage(input: {
  messageId: string
  imageKey: string
}): Promise<void> {
  const token = await getTenantAccessToken()
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'image',
      content: JSON.stringify({ image_key: input.imageKey }),
    }),
  })

  if (!res.ok) {
    throw new Error(`feishu_reply_image_failed_${res.status}`)
  }
}

export async function uploadImageFromUrl(input: {
  imageUrl: string
}): Promise<{ imageKey: string }> {
  const token = await getTenantAccessToken()

  const normalizeUrl = (u: string) =>
    u.replace(
      'https://copilot-cn.bytedance.net/app/ide/v1/text_to_image',
      'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image',
    )

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const url = normalizeUrl(input.imageUrl)

  let lastStatus = 0
  let lastType = ''
  let lastBytes = 0

  const minBytes = 140_000
  const bigBytes = 180_000
  let buf: ArrayBuffer | null = null
  let contentType = 'image/png'
  let firstHash: string | null = null
  let prevHash: string | null = null

  const hashOf = (ab: ArrayBuffer) =>
    createHash('sha256').update(Buffer.from(ab)).digest('hex')

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const imgRes = await fetch(url, {
      headers: {
        accept: 'image/*,*/*;q=0.8',
      },
    }).catch(() => null)

    if (!imgRes) {
      await sleep(800 + attempt * 700)
      continue
    }

    lastStatus = imgRes.status
    if (!imgRes.ok) {
      await sleep(800 + attempt * 700)
      continue
    }

    contentType = imgRes.headers.get('content-type') || 'image/png'
    lastType = contentType
    const ab = await imgRes.arrayBuffer()
    lastBytes = ab.byteLength

    const loweredType = contentType.toLowerCase()
    if (
      loweredType.includes('svg') ||
      loweredType.includes('xml') ||
      loweredType.includes('html') ||
      loweredType.includes('text')
    ) {
      await sleep(1200 + attempt * 900)
      continue
    }

    if (!contentType.startsWith('image/')) {
      await sleep(800 + attempt * 700)
      continue
    }

    if (ab.byteLength < minBytes) {
      await sleep(1400 + attempt * 900)
      continue
    }

    const h = hashOf(ab)
    if (!firstHash) firstHash = h

    if (!prevHash) {
      prevHash = h
      await sleep(900)
      continue
    }

    const changed = h !== prevHash || h !== firstHash
    prevHash = h

    if (changed || ab.byteLength >= bigBytes) {
      buf = ab
      break
    }

    await sleep(1200 + attempt * 900)
    continue

    
  }

  if (!buf) {
    throw new Error(`image_not_ready_${lastStatus}_${lastType}_${lastBytes}`)
  }

  const blob = new Blob([buf], { type: contentType })

  const form = new FormData()
  form.set('image_type', 'message')
  form.set('image', blob, 'kv.png')

  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: form,
  })

  const json = (await res.json().catch(() => null)) as any
  const key = json?.data?.image_key
  if (!res.ok || json?.code !== 0 || typeof key !== 'string') {
    const code = json?.code ?? res.status
    const msg = json?.msg ?? 'upload_image_failed'
    throw new Error(`feishu_upload_image_${code}_${msg}`)
  }

  return { imageKey: key }
}

export async function uploadImageFromBytes(input: {
  bytes: Uint8Array
  filename?: string
  contentType?: string
}): Promise<{ imageKey: string }> {
  const token = await getTenantAccessToken()
  const blob = new Blob([input.bytes], { type: input.contentType ?? 'image/png' })

  const form = new FormData()
  form.set('image_type', 'message')
  form.set('image', blob, input.filename ?? 'kv.png')

  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: form,
  })

  const json = (await res.json().catch(() => null)) as any
  const key = json?.data?.image_key
  if (!res.ok || json?.code !== 0 || typeof key !== 'string') {
    const code = json?.code ?? res.status
    const msg = json?.msg ?? 'upload_image_failed'
    throw new Error(`feishu_upload_image_${code}_${msg}`)
  }

  return { imageKey: key }
}

export async function downloadImageBytes(input: {
  imageKey: string
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const token = await getTenantAccessToken()
  const url = `https://open.feishu.cn/open-apis/im/v1/images/${encodeURIComponent(input.imageKey)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error(`feishu_download_image_failed_${res.status}`)
  const ab = await res.arrayBuffer()
  const bytes = new Uint8Array(ab)
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { bytes, contentType }
}

export function parseImageKeyFromMessageContent(contentRaw: string): string | null {
  try {
    const parsed = JSON.parse(contentRaw) as any
    const key = parsed?.image_key
    return typeof key === 'string' && key.trim() ? key.trim() : null
  } catch {
    return null
  }
}

export function parsePostContent(contentRaw: string): {
  text: string
  imageKeys: string[]
} {
  const empty = { text: '', imageKeys: [] as string[] }
  let parsed: any
  try {
    parsed = JSON.parse(contentRaw)
  } catch {
    return empty
  }

  const post = parsed?.post
  if (!post || typeof post !== 'object') return empty

  const locale =
    (typeof post.zh_cn === 'object' && post.zh_cn) ||
    (typeof post.en_us === 'object' && post.en_us) ||
    Object.values(post).find((v: any) => typeof v === 'object' && v)

  const content = (locale as any)?.content
  if (!Array.isArray(content)) return empty

  const texts: string[] = []
  const imageKeys: string[] = []

  const walk = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    if (typeof node !== 'object') return

    const tag = typeof node.tag === 'string' ? node.tag : ''
    if (tag === 'text') {
      if (typeof node.text === 'string' && node.text.trim()) texts.push(node.text.trim())
    } else if (tag === 'img' || tag === 'image') {
      const key = node.image_key || node.imageKey
      if (typeof key === 'string' && key.trim()) imageKeys.push(key.trim())
    }

    for (const v of Object.values(node)) walk(v)
  }

  walk(content)

  return {
    text: texts.join('\n').trim(),
    imageKeys: imageKeys.filter((k, i) => imageKeys.indexOf(k) === i),
  }
}
