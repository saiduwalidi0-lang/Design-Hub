/**
 * 调用仓库根目录 `rmbg-local-server`：`POST /cutout`，multipart 字段名 `image`。
 * 与 banner-expand-tool「本地 RMBG」同源，不经过 ComfyUI。
 */

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

export function getRmbgLocalServerBase(): string {
  const u =
    env('RMBG_LOCAL_URL') ?? env('RMBG_LOCAL_SERVER') ?? env('VITE_RMBG_LOCAL_SERVER') ?? 'http://127.0.0.1:8765'
  return u.replace(/\/+$/, '')
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
  if (!m?.[1]) throw new Error('invalid_data_url')
  return Buffer.from(m[1], 'base64')
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
}

export async function cutoutPngDataUrlWithRmbgLocal(inputDataUrl: string): Promise<string> {
  const base = getRmbgLocalServerBase()
  const buf = dataUrlToBuffer(inputDataUrl)
  const form = new FormData()
  form.append('image', new Blob([buf], { type: 'image/png' }), 'input.png')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  try {
    const res = await fetch(`${base}/cutout`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`rmbg_local_http_${res.status}_${text.slice(0, 240)}`)
    }
    const out = new Uint8Array(await res.arrayBuffer())
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
    return bytesToDataUrl(out, ct)
  } finally {
    clearTimeout(timer)
  }
}
