import { getTenantAccessToken } from './feishu.js'

function extractFirstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m?.[1] ?? null
}

export function extractFeishuDocToken(text: string):
  | { type: 'wiki'; token: string }
  | { type: 'docx'; documentId: string }
  | null {
  const wiki =
    extractFirstMatch(text, /https?:\/\/(?:[^\s/]+\.)?(?:larkoffice|feishu)\.com\/wiki\/([A-Za-z0-9]+)/i) ||
    extractFirstMatch(text, /\bwiki\/([A-Za-z0-9]{10,})\b/i)
  if (wiki) return { type: 'wiki', token: wiki }

  const docx =
    extractFirstMatch(text, /https?:\/\/(?:[^\s/]+\.)?(?:larkoffice|feishu)\.com\/docx\/([A-Za-z0-9]+)/i) ||
    extractFirstMatch(text, /\bdocx\/([A-Za-z0-9]{10,})\b/i)
  if (docx) return { type: 'docx', documentId: docx }

  return null
}

async function fetchJson(url: string, token: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
    signal,
  })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    throw new Error(`http_${res.status}`)
  }
  if (json?.code && json.code !== 0) {
    throw new Error(`feishu_${json.code}_${json.msg ?? 'error'}`)
  }
  return json
}

async function getWikiRaw(nodeToken: string, token: string, signal?: AbortSignal): Promise<string | null> {
  const url = `https://open.feishu.cn/open-apis/wiki/v2/nodes/${encodeURIComponent(nodeToken)}/raw`
  const json = await fetchJson(url, token, signal)
  const content =
    json?.data?.content ??
    json?.data?.raw_content ??
    json?.data?.node?.content
  return typeof content === 'string' && content.trim() ? content : null
}

async function getWikiNodeObj(nodeToken: string, token: string, signal?: AbortSignal): Promise<
  | { objType: string; objToken: string }
  | null
> {
  const url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}&obj_type=wiki`
  const json = await fetchJson(url, token, signal)
  const node = json?.data?.node
  const objType = node?.obj_type
  const objToken = node?.obj_token
  if (typeof objType === 'string' && typeof objToken === 'string' && objToken.trim()) {
    return { objType, objToken }
  }
  return null
}

async function getDocxRaw(documentId: string, token: string, signal?: AbortSignal): Promise<string | null> {
  const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`
  const json = await fetchJson(url, token, signal)
  const content = json?.data?.content
  return typeof content === 'string' && content.trim() ? content : null
}

export async function fetchPrdTextFromMessage(messageText: string, input?: {
  timeoutMs?: number
}): Promise<{ prdText: string; source: string } | null> {
  const ref = extractFeishuDocToken(messageText)
  if (!ref) return null

  const access = await getTenantAccessToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(300, input?.timeoutMs ?? 1600))
  try {
    if (ref.type === 'docx') {
      const text = await getDocxRaw(ref.documentId, access, controller.signal)
      if (!text) return null
      return { prdText: text, source: `docx:${ref.documentId}` }
    }

    const raw = await getWikiRaw(ref.token, access, controller.signal).catch(() => null)
    if (raw) return { prdText: raw, source: `wiki:${ref.token}` }

    const node = await getWikiNodeObj(ref.token, access, controller.signal).catch(() => null)
    if (node?.objType === 'docx' && node.objToken) {
      const text = await getDocxRaw(node.objToken, access, controller.signal).catch(() => null)
      if (!text) return null
      return { prdText: text, source: `wiki:${ref.token}->docx:${node.objToken}` }
    }

    return null
  } finally {
    clearTimeout(timeout)
  }
}

export function buildEnrichedRequirementText(input: {
  original: string
  prdText: string
  maxChars?: number
}): string {
  const max = Math.max(1000, input.maxChars ?? 12_000)
  const clipped = input.prdText.length > max ? `${input.prdText.slice(0, max)}\n…（已截断）` : input.prdText
  return [
    input.original.trim(),
    '',
    '---',
    'PRD 原文（自动抓取）：',
    clipped.trim(),
  ]
    .filter(Boolean)
    .join('\n')
}

