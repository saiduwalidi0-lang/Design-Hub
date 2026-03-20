export async function downloadImageFromUrl(input: {
  url: string
  timeoutMs?: number
  maxBytes?: number
}): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const timeoutMs = Math.max(2_000, input.timeoutMs ?? 10_000)
  const maxBytes = Math.max(50_000, input.maxBytes ?? 1_900_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(input.url, {
      headers: {
        accept: 'image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    }).catch(() => null)
    if (!res || !res.ok) return null

    const ct = res.headers.get('content-type') || 'application/octet-stream'
    if (!ct.toLowerCase().includes('image/')) return null

    const ab = await res.arrayBuffer()
    if (ab.byteLength <= 0) return null
    if (ab.byteLength > maxBytes) return null
    return { bytes: new Uint8Array(ab), contentType: ct }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

