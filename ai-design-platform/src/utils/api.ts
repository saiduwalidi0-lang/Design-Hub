import type { DesignTask } from '@/types'

type ApiOk<T> = { success: true } & T
type ApiErr = { success: false; error?: string }

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `请求失败（HTTP ${res.status}）`
  try {
    const json = JSON.parse(text) as { error?: string }
    if (json?.error) return `请求失败（HTTP ${res.status}）：${json.error}`
  } catch {
    // ignore
  }
  const short = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  return `请求失败（HTTP ${res.status}）：${short || res.statusText || 'Unknown'}`
}

export async function createTask(input: {
  requirementText: string
  styleHint?: string
  imageCount: number
  referenceUrls?: string[]
  mode?: 'generate' | 'revise'
  referenceImageDataUrls?: string[]
}): Promise<ApiOk<{ taskId: string }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const text = await res.text().catch(() => '')
  const data = ((): ApiOk<{ taskId: string }> | ApiErr | null => {
    if (!text) return null
    try {
      return JSON.parse(text) as ApiOk<{ taskId: string }> | ApiErr
    } catch {
      return null
    }
  })()

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  if (!data) return { success: false, error: '响应解析失败（非 JSON）' }
  return data
}

export async function getTask(
  id: string,
): Promise<ApiOk<{ task: DesignTask }> | ApiErr> {
  let res: Response
  try {
    res = await fetch(`/api/tasks/${encodeURIComponent(id)}`)
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const text = await res.text().catch(() => '')
  const data = ((): ApiOk<{ task: DesignTask }> | ApiErr | null => {
    if (!text) return null
    try {
      return JSON.parse(text) as ApiOk<{ task: DesignTask }> | ApiErr
    } catch {
      return null
    }
  })()

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  if (!data) return { success: false, error: '响应解析失败（非 JSON）' }
  return data
}

export async function analyzeImage(input: {
  dataUrl: string
  prompt?: string
}): Promise<ApiOk<{ text: string }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/vision/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as ApiOk<{ text: string }> | ApiErr
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function renderKvImage(input: {
  prompt: string
  imageSize: string
  referenceAssetName?: string
  referenceImageDataUrl?: string
}): Promise<ApiOk<{ url: string }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/kv/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as ApiOk<{ url: string }> | ApiErr
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function searchFigmaLibrary(input: {
  q: string
  limit?: number
  teamId?: string
  mode?: 'name' | 'ai'
  scan?: number
}): Promise<
  | ApiOk<{
      results: Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; caption?: string }>
      normalized?: { original: string; normalized: string; tags: string[] }
    }>
  | ApiErr
> {
  const params = new URLSearchParams()
  params.set('q', input.q)
  if (input.limit != null) params.set('limit', String(input.limit))
  if (input.teamId) params.set('teamId', input.teamId)
  if (input.mode) params.set('mode', input.mode)
  if (input.scan != null) params.set('scan', String(input.scan))

  let res: Response
  try {
    res = await fetch(`/api/figma/search?${params.toString()}`)
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function getFigmaIndexStatus(): Promise<
  ApiOk<{ status: any }> | ApiErr
> {
  let res: Response
  try {
    res = await fetch('/api/figma/index/status')
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function startFigmaIndex(input: {
  teamId?: string
  maxAnalyze?: number
  concurrency?: number
}): Promise<ApiOk<{ started: boolean; status: any }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/figma/index/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function stopFigmaIndex(): Promise<ApiOk<{ stopped: boolean; status: any }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/figma/index/stop', { method: 'POST' })
  } catch (e) {
    return {
      success: false,
      error: `网络错误：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function cmsListFigmaCaptions(input: {
  q?: string
  offset?: number
  limit?: number
}): Promise<ApiOk<{ total: number; items: any[] }> | ApiErr> {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.offset != null) params.set('offset', String(input.offset))
  if (input.limit != null) params.set('limit', String(input.limit))

  let res: Response
  try {
    res = await fetch(`/api/cms/figma-captions?${params.toString()}`)
  } catch (e) {
    return { success: false, error: `网络错误：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function cmsDeleteFigmaCaption(fileKey: string): Promise<ApiOk<{ deleted: boolean }> | ApiErr> {
  let res: Response
  try {
    res = await fetch(`/api/cms/figma-captions/${encodeURIComponent(fileKey)}`, { method: 'DELETE' })
  } catch (e) {
    return { success: false, error: `网络错误：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function cmsUpdateFigmaCaption(input: { fileKey: string; caption: string }): Promise<ApiOk<{}> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/cms/figma-captions/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return { success: false, error: `网络错误：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function cmsDedupeFigmaCaptions(input: { dryRun?: boolean }): Promise<
  ApiOk<{ duplicates: number; removed: number; dryRun: boolean }> | ApiErr
> {
  let res: Response
  try {
    res = await fetch('/api/cms/figma-captions/dedupe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'imageHash', dryRun: Boolean(input.dryRun) }),
    })
  } catch (e) {
    return { success: false, error: `网络错误：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}

export async function createFeishuDocFromTask(input: {
  taskId: string
  title?: string
  folderToken?: string
}): Promise<ApiOk<{ url: string; written: boolean; writeError?: string }> | ApiErr> {
  let res: Response
  try {
    res = await fetch('/api/feishu/docx/create_from_task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return { success: false, error: `网络错误：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!res.ok) return { success: false, error: await readErrorMessage(res) }
  const text = await res.text().catch(() => '')
  if (!text) return { success: false, error: '响应解析失败（空响应）' }
  try {
    return JSON.parse(text) as any
  } catch {
    return { success: false, error: '响应解析失败（非 JSON）' }
  }
}
