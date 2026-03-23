import { getTenantAccessToken } from './feishu.js'

type FeishuOk<T> = { code: 0; msg: string; data: T }

function pickString(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function feishuJson<T>(input: {
  method: 'GET' | 'POST' | 'PATCH'
  url: string
  body?: any
  timeoutMs?: number
}): Promise<T> {
  const token = await getTenantAccessToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(2_000, input.timeoutMs ?? 20_000))
  try {
    const res = await fetch(input.url, {
      method: input.method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const msg = pickString(json?.msg) || pickString(json?.error?.message) || `http_${res.status}`
      const fv = json?.error?.field_violations
      const details = Array.isArray(fv) ? `:${JSON.stringify(fv).slice(0, 300)}` : ''
      throw new Error(`${msg}${details}`)
    }
    if (json?.code && json.code !== 0) {
      const fv = json?.error?.field_violations
      const details = Array.isArray(fv) ? `:${JSON.stringify(fv).slice(0, 300)}` : ''
      throw new Error(`feishu_${json.code}_${json.msg ?? 'error'}${details}`)
    }
    return json as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function createDocx(input: {
  title: string
  folderToken?: string
}): Promise<{ documentId: string; url: string; blockId?: string }> {
  const body: any = { title: input.title }
  if (input.folderToken) body.folder_token = input.folderToken

  const json = await feishuJson<
    FeishuOk<{ document?: { document_id?: string; url?: string; block_id?: string } }>
  >({
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/docx/v1/documents',
    body,
    timeoutMs: 20_000,
  })

  const doc = json?.data?.document
  const documentId =
    pickString(doc?.document_id) ||
    pickString((json as any)?.data?.document_id) ||
    pickString((json as any)?.data?.doc_id) ||
    pickString((json as any)?.data?.document?.doc_id)

  const url =
    pickString(doc?.url) ||
    pickString((json as any)?.data?.url) ||
    pickString((json as any)?.data?.document?.url)

  if (!documentId) {
    const hint = (() => {
      try {
        return JSON.stringify(json).slice(0, 600)
      } catch {
        return ''
      }
    })()
    throw new Error(`create_doc_failed${hint ? `: ${hint}` : ''}`)
  }

  const finalUrl = url || `https://www.feishu.cn/docx/${encodeURIComponent(documentId)}`

  const blockId =
    pickString(doc?.block_id) ||
    pickString((json as any)?.data?.block_id) ||
    pickString((json as any)?.data?.document?.block_id) ||
    undefined
  return { documentId, url: finalUrl, blockId }
}

export async function getDocx(input: { documentId: string }): Promise<{ blockId?: string; title?: string }> {
  const json = await feishuJson<FeishuOk<{ document?: any }>>({
    method: 'GET',
    url: `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(input.documentId)}`,
    timeoutMs: 15_000,
  })

  const doc = json?.data?.document
  return {
    blockId: pickString(doc?.block_id) ?? undefined,
    title: pickString(doc?.title) ?? undefined,
  }
}

function splitLines(text: string): string[] {
  const raw = String(text || '')
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const l of lines) {
    const t = l.trimEnd()
    out.push(t)
  }
  return out
}

function buildDescendantsPlainTextA(lines: string[]): any {
  return {
    children_id: ['0'],
    descendants: lines.map((line) => ({
      block_type: 2,
      text: {
        elements: [
          {
            text_run: {
              content: line || ' ',
            },
          },
        ],
      },
    })),
  }
}


async function tryAppendDescendant(input: {
  documentId: string
  blockId: string
  body: any
}): Promise<void> {
  await feishuJson<any>({
    method: 'POST',
    url: `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.blockId)}/descendant?document_revision_id=-1`,
    body: input.body,
    timeoutMs: 45_000,
  })
}

export async function appendMarkdownAsPlainText(input: {
  documentId: string
  blockId: string
  markdown: string
}): Promise<{ written: boolean; error?: string }> {
  const lines = splitLines(input.markdown)
    .filter((x) => x.length <= 4000)
    .slice(0, 450)

  const chunks: string[][] = []
  let buf: string[] = []
  for (const l of lines) {
    buf.push(l)
    if (buf.length >= 80) {
      chunks.push(buf)
      buf = []
    }
  }
  if (buf.length) chunks.push(buf)

  const variants = [buildDescendantsPlainTextA] as const
  let lastErr: string | undefined
  for (const build of variants) {
    try {
      for (const c of chunks) {
        await tryAppendDescendant({ documentId: input.documentId, blockId: input.blockId, body: build(c) })
      }
      return { written: true }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = msg
      continue
    }
  }

  return { written: false, error: lastErr ? `write_failed:${lastErr}` : 'write_failed' }
}
