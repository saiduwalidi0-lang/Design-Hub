import type { CreateTaskInput } from '../types.js'
import type { VisualDirection } from './designSpecGenerator.js'

type AiPlan = {
  topic?: string
  directions: VisualDirection[]
}

function parseListValue(s: string): string[] {
  return s
    .split(/[;；]/g)
    .map((x) => x.trim())
    .filter(Boolean)
}

function parsePaletteValue(s: string): { name: string; hex: string; usage: string }[] {
  const items = s
    .split(/[;；]/g)
    .map((x) => x.trim())
    .filter(Boolean)

  const out: { name: string; hex: string; usage: string }[] = []
  for (const it of items) {
    const m = it.match(/^(.+?)=\s*(#[0-9A-Fa-f]{6})\s*\((.+?)\)\s*$/)
    if (!m) continue
    out.push({ name: m[1].trim(), hex: m[2].trim(), usage: m[3].trim() })
  }
  return out
}

function parseKvPlan(text: string): AiPlan | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let topic: string | undefined
  const directions: any[] = []
  let cur: any | null = null

  const startDir = () => {
    if (cur) directions.push(cur)
    cur = {
      name: '',
      tagline: '',
      keywords: [],
      storytelling: '',
      palette: [],
      typography: [],
      motifs: [],
      texture: [],
      composition: [],
      imageQueries: [],
    }
  }

  for (const line of lines) {
    if (/^TOPIC\s*:/i.test(line)) {
      topic = line.replace(/^TOPIC\s*:\s*/i, '').trim()
      continue
    }

    if (/^DIRECTION\s*\d*\s*:/i.test(line)) {
      startDir()
      continue
    }

    if (!cur) continue

    const kv = line.split(/:\s*/)
    if (kv.length < 2) continue
    const key = kv[0].trim().toUpperCase()
    const value = line.slice(line.indexOf(':') + 1).trim()

    if (key === 'NAME') cur.name = value
    else if (key === 'TAGLINE') cur.tagline = value
    else if (key === 'KEYWORDS') cur.keywords = parseListValue(value)
    else if (key === 'STORY') cur.storytelling = value
    else if (key === 'PALETTE') cur.palette = parsePaletteValue(value)
    else if (key === 'TYPOGRAPHY') cur.typography = parseListValue(value)
    else if (key === 'MOTIFS') cur.motifs = parseListValue(value)
    else if (key === 'TEXTURE') cur.texture = parseListValue(value)
    else if (key === 'COMPOSITION') cur.composition = parseListValue(value)
    else if (key === 'IMAGE_QUERIES') cur.imageQueries = parseListValue(value)
  }

  if (cur) directions.push(cur)

  const normalized = directions
    .map(normalizeDirection)
    .filter(Boolean)
    .slice(0, 3) as VisualDirection[]

  if (normalized.length === 0) return null
  return { topic, directions: normalized }
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = env(name)
  if (!v) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = (env(name) ?? '').trim()
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function normalizeArkChatBaseUrl(baseUrl: string): string {
  const u = baseUrl.replace(/\/+$/, '')
  if (u.endsWith('/chat/completions')) return u
  if (u.endsWith('/api/v3')) return `${u}/chat/completions`
  return `${u}/chat/completions`
}

function normalizeArkResponsesUrl(baseUrl: string): string {
  const u = baseUrl.replace(/\/+$/, '')
  if (u.endsWith('/responses')) return u
  if (u.endsWith('/api/v3')) return `${u}/responses`
  return `${u}/responses`
}

export function isVisionAiConfigured(): boolean {
  const arkKey = env('ARK_VISION_API_KEY')
  const arkModel = env('ARK_VISION_MODEL')
  const arkBase = env('ARK_VISION_BASE_URL')
  if (arkKey && arkModel && arkBase) return true
  return envFlag('AI_SUPPORTS_VISION', false)
}

function looksLikeMissingImage(content: string): boolean {
  const t = content.trim()
  if (!t) return false
  const hits = ['请你提供', '请提供', '无法查看', '看不到', '未收到', '没有收到']
  const targets = ['图片', '缩略图', '设计稿', '内容描述']
  const enHits = ['please provide', 'cannot see', "can't see", 'unable to view', 'no image', 'did not receive']
  const enTargets = ['image', 'thumbnail', 'screenshot', 'design']
  const hasHit = hits.some((h) => t.includes(h))
  const hasTarget = targets.some((k) => t.includes(k))
  const tLower = t.toLowerCase()
  const hasEnHit = enHits.some((h) => tLower.includes(h))
  const hasEnTarget = enTargets.some((k) => tLower.includes(k))
  return (hasHit && hasTarget) || (hasEnHit && hasEnTarget)
}

function cleanVisionLabelValue(v: string): string {
  let s = v.trim()
  s = s.replace(/^"+|"+$/g, '').trim()
  s = s.replace(/\bwait\b[^.\n]*[.\n]?/gi, ' ')
  s = s.replace(/\blet'?s\b[^.\n]*[.\n]?/gi, ' ')
  s = s.replace(/\bthat'?s\b[^.\n]*[.\n]?/gi, ' ')
  s = s.replace(/\bcorrect\b[^.\n]*[.\n]?/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/\bThat\b\.?$/i, '').trim()
  s = s.replace(/\b(yeah|yep|perfect|great)\b\s*:?/gi, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/\s*[\.,;:]+\s*$/g, '').trim()
  return s
}

const VISION_LABELS = [
  'Design Type:',
  'Main Title Design:',
  'Composition Method:',
  'Key Elements:',
  'Color & Lighting:',
  'Texture & Material:',
  'Font Design:',
  'Content Generation Rules:',
  'Keywords:',
] as const

function normalizeVisionLabeledText(text: string): string {
  const t = text.replace(/\r\n/g, '\n')
  const pattern = new RegExp(`(${VISION_LABELS.map((x) => x.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|')})`, 'g')
  const matches = Array.from(t.matchAll(pattern))
  if (matches.length === 0) return text.trim()

  const parts: Array<{ label: string; value: string }> = []
  for (let i = 0; i < matches.length; i += 1) {
    const label = matches[i][1]
    const start = (matches[i].index ?? 0) + label.length
    const end = i + 1 < matches.length ? matches[i + 1].index ?? t.length : t.length
    const raw = t.slice(start, end)
    const value = cleanVisionLabelValue(raw)
    if (!value) continue
    parts.push({ label, value })
  }

  const map = new Map<string, string>()
  for (const p of parts) map.set(p.label, p.value)

  const normalizeKeywords = (v: string): string => {
    const cutIdx = v.search(/\b\d+\s*[\).:-]/)
    const base = cutIdx > 0 ? v.slice(0, cutIdx) : v
    const tokens = base
      .split(/[\n,;]+/)
      .map((x) => x.replace(/^\s*\d+\s*[\).:-]\s*/g, '').trim())
      .filter(Boolean)
    const uniq: string[] = []
    for (const t of tokens) {
      const key = t.toLowerCase()
      if (uniq.some((u) => u.toLowerCase() === key)) continue
      uniq.push(t)
      if (uniq.length >= 12) break
    }
    return uniq.join(', ')
  }

  const lines: string[] = []
  for (const k of VISION_LABELS) {
    const v = map.get(k)
    if (!v) continue
    const out = k === 'Keywords:' ? normalizeKeywords(v) : v
    if (!out.trim()) continue
    lines.push(`${k} ${out}`.trim())
  }
  return lines.join('\n').trim()
}

async function analyzeImageWithArkVision(input: {
  bytes: Uint8Array
  contentType: string
  prompt: string
}): Promise<{ text: string | null; error?: string }> {
  const apiKey = env('ARK_VISION_API_KEY')
  const model = env('ARK_VISION_MODEL')
  const base = env('ARK_VISION_BASE_URL')
  if (!apiKey || !model || !base) return { text: null, error: 'missing_ark_vision_env' }

  const style = envEnum('ARK_VISION_API_STYLE', ['responses', 'chat'] as const, 'responses')

  const url = style === 'chat' ? normalizeArkChatBaseUrl(base) : normalizeArkResponsesUrl(base)
  const b64 = Buffer.from(input.bytes).toString('base64')
  const dataUrl = `data:${input.contentType || 'image/jpeg'};base64,${b64}`

  const controller = new AbortController()
  const timeoutMs = style === 'responses' ? 90_000 : 60_000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body =
      style === 'chat'
        ? {
            model,
            temperature: 0.2,
            max_tokens: 700,
            stream: false,
            messages: [
              {
                role: 'system',
                content: '你是资深视觉设计总监与图像解读助手。用自然语言给出要点，不要输出 Markdown。',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: input.prompt },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }
        : {
            model,
            temperature: 0.2,
            max_output_tokens: 1400,
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_image', image_url: dataUrl },
                  { type: 'input_text', text: input.prompt },
                ],
              },
            ],
          }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const raw = await res.text().catch(() => '')
    if (!res.ok) {
      const json = safeJsonParseLenient<any>(raw)
      const msg =
        (typeof json?.error?.message === 'string' && json.error.message) ||
        (typeof json?.message === 'string' && json.message) ||
        raw.slice(0, 400) ||
        'unknown_error'
      return { text: null, error: `ark_http_${res.status}:${msg}` }
    }
    const json = safeJsonParseLenient<any>(raw)

    let content: string | null = null
    if (typeof json?.choices?.[0]?.message?.content === 'string') {
      content = json.choices[0].message.content
    } else if (typeof json?.output_text === 'string') {
      content = json.output_text
    } else if (Array.isArray(json?.output)) {
      const msg = json.output.find((x: any) => x?.type === 'message' && Array.isArray(x?.content))
      if (msg) {
        const parts = (msg.content as any[])
          .map((c) => (typeof c?.text === 'string' ? c.text : null))
          .filter(Boolean) as string[]
        content = parts.join('\n').trim() || null
      }

      if (!content) {
        const reasoning = json.output.find((x: any) => x?.type === 'reasoning' && Array.isArray(x?.summary))
        const summary = Array.isArray(reasoning?.summary)
          ? (reasoning.summary as any[])
              .map((s) => (typeof s?.text === 'string' ? s.text : null))
              .filter(Boolean)
              .join('\n')
          : ''
        const idx = summary.indexOf('Design Type:')
        if (idx >= 0) {
          const block = summary.slice(idx)
          const labels = [
            'Design Type:',
            'Main Title Design:',
            'Composition Method:',
            'Key Elements:',
            'Color & Lighting:',
            'Texture & Material:',
            'Font Design:',
            'Content Generation Rules:',
            'Keywords:',
          ] as const

          const keep = block
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .filter((l) =>
              labels.some((k) => l.startsWith(k)),
            )
            .map((l) => {
              const k = labels.find((x) => l.includes(x))
              if (!k) return l
              const last = l.lastIndexOf(k)
              const raw = l.slice(last + k.length)
              return `${k} ${cleanVisionLabelValue(raw)}`.trim()
            })
          content = keep.join('\n').trim() || null
        }
      }
    }

    if (typeof content !== 'string' || !content.trim()) {
      return { text: null, error: 'empty_response' }
    }
    if (looksLikeMissingImage(content)) return { text: null, error: 'vision_not_supported' }
    const normalized = content.includes('Design Type:') ? normalizeVisionLabeledText(content) : content.trim()
    return { text: normalized }
  } catch (e: any) {
    return { text: null, error: e?.name === 'AbortError' ? 'timeout' : 'request_failed' }
  } finally {
    clearTimeout(timeout)
  }
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function safeJsonParseLenient<T>(text: string): T | null {
  const direct = safeJsonParse<T>(text)
  if (direct) return direct

  const normalized = text
    .replace(/\uFEFF/g, '')
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, '$1')

  return safeJsonParse<T>(normalized)
}

function extractJsonBlock(text: string): string {
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fence?.[1]) return fence[1]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) return text.slice(first, last + 1)
  return text
}

function normalizeDirection(d: any): VisualDirection | null {
  if (!d || typeof d !== 'object') return null
  if (typeof d.name !== 'string' || !d.name.trim()) return null

  const palette = Array.isArray(d.palette) ? d.palette : []
  const normPalette = palette
    .map((p: any) => ({
      name: typeof p?.name === 'string' ? p.name : '',
      hex: typeof p?.hex === 'string' ? p.hex : '',
      usage: typeof p?.usage === 'string' ? p.usage : '',
    }))
    .filter((p: any) => p.name && p.hex)

  const list = (v: any): string[] =>
    Array.isArray(v)
      ? v
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
      : []

  const imageQueries = list(d.imageQueries).slice(0, 6)

  return {
    name: d.name.trim(),
    tagline: typeof d.tagline === 'string' ? d.tagline.trim() : '',
    keywords: list(d.keywords).slice(0, 12),
    storytelling: typeof d.storytelling === 'string' ? d.storytelling.trim() : '',
    palette: normPalette.slice(0, 8),
    typography: list(d.typography).slice(0, 8),
    motifs: list(d.motifs).slice(0, 10),
    texture: list(d.texture).slice(0, 10),
    composition: list(d.composition).slice(0, 10),
    imageQueries: imageQueries.length ? imageQueries : [d.name.trim() + ' poster'],
  }
}

export function isAiConfigured(): boolean {
  return Boolean(env('AI_API_KEY') && env('AI_BASE_URL'))
}

export async function generatePlanWithAI(input: CreateTaskInput): Promise<{
  plan: AiPlan | null
  error?: string
}> {
  const apiKey = env('AI_API_KEY')
  const model = env('AI_MODEL') ?? 'auto'
  if (!apiKey) return { plan: null, error: 'missing_env' }

  const baseUrl = env('AI_BASE_URL') ?? 'https://api.openai.com/v1'
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const url = normalizedBase.endsWith('/chat/completions')
    ? normalizedBase
    : `${normalizedBase}/chat/completions`

  const system =
    '你是资深视觉设计总监。请严格按“键值格式”输出，不要输出解释文字、不要输出 Markdown。所有 value 不要包含换行。'

  const user = [
    `requirementText: ${input.requirementText}`,
    `styleHint: ${input.styleHint ?? ''}`,
    '',
    '输出格式（严格遵守，所有 value 不要包含换行）：',
    'TOPIC: <一句话主题>',
    'DIRECTION 1:',
    'NAME: <方向名称>',
    'TAGLINE: <一句话方向>',
    'KEYWORDS: <kw1; kw2; kw3; kw4; kw5>',
    'STORY: <1 句叙事>',
    'PALETTE: <Name=#RRGGBB(用途); Name=#RRGGBB(用途); ...>',
    'TYPOGRAPHY: <item1; item2; item3>',
    'MOTIFS: <item1; item2; item3>',
    'TEXTURE: <item1; item2; item3>',
    'COMPOSITION: <item1; item2; item3>',
    'IMAGE_QUERIES: <q1; q2; q3>',
    '',
    '要求：',
    '- 输出 3 个 DIRECTION，差异明显',
    '- KEYWORDS/IMAGE_QUERIES 都尽量短，避免长句',
    '- IMAGE_QUERIES 用于 Pinterest/Behance/图库搜索，短关键词（中英文混合可）',
    '- PALETTE hex 必须是 #RRGGBB',
  ].join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const callOnce = async (useJsonMode: boolean): Promise<Response> => {
      return await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 800,
          stream: false,
          ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })
    }

    let res = await callOnce(true)
    if (!res.ok && res.status === 400) {
      res = await callOnce(false)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        plan: null,
        error: `http_${res.status}${text ? `: ${text.slice(0, 400)}` : ''}`,
      }
    }

    const data = (await res.json()) as any
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) return { plan: null, error: 'empty_content' }

    const kvPlan = parseKvPlan(content)
    if (kvPlan) return { plan: kvPlan }

    const jsonText = extractJsonBlock(content)
    const parsed = safeJsonParseLenient<any>(jsonText)
    if (!parsed) return { plan: null, error: `unparseable: ${content.slice(0, 240)}` }

    const directionsRaw = Array.isArray(parsed.directions) ? parsed.directions : []
    const directions = directionsRaw
      .map(normalizeDirection)
      .filter(Boolean)
      .slice(0, 3) as VisualDirection[]

    if (directions.length === 0) return { plan: null, error: 'no_directions' }

    return {
      plan: {
        topic: typeof parsed.topic === 'string' ? parsed.topic.trim() : undefined,
        directions,
      },
    }
  } catch {
    return { plan: null, error: 'request_failed_or_timeout' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function analyzeImageWithAI(input: {
  bytes: Uint8Array
  contentType: string
  prompt?: string
}): Promise<{ text: string | null; error?: string }> {
  const userPrompt =
    input.prompt?.trim() ||
    '请识别图片内容，并提炼：主题/场景/主体/情绪/风格关键词/配色倾向/版式特征。输出 6-10 条要点。'

  if (env('ARK_VISION_API_KEY') && env('ARK_VISION_MODEL') && env('ARK_VISION_BASE_URL')) {
    return await analyzeImageWithArkVision({
      bytes: input.bytes,
      contentType: input.contentType,
      prompt: userPrompt,
    })
  }

  const apiKey = env('AI_API_KEY')
  const model = env('AI_MODEL') ?? 'auto'
  if (!apiKey) return { text: null, error: 'missing_env' }

  const baseUrl = env('AI_BASE_URL') ?? 'https://api.openai.com/v1'
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const url = normalizedBase.endsWith('/chat/completions')
    ? normalizedBase
    : `${normalizedBase}/chat/completions`

  const maxBytes = 1_900_000
  if (input.bytes.byteLength > maxBytes) {
    return { text: null, error: 'image_too_large' }
  }

  const b64 = Buffer.from(input.bytes).toString('base64')
  const dataUrl = `data:${input.contentType || 'image/jpeg'};base64,${b64}`

  const system = '你是资深视觉设计总监与图像解读助手。用自然语言给出要点，不要输出 Markdown。'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) return { text: null, error: `http_${res.status}` }

    const json = safeJsonParseLenient<any>(text)
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return { text: null, error: 'empty_response' }
    }
    if (looksLikeMissingImage(content)) {
      return { text: null, error: 'vision_not_supported' }
    }
    return { text: content.trim() }
  } catch (e: any) {
    return { text: null, error: e?.name === 'AbortError' ? 'timeout' : 'request_failed' }
  } finally {
    clearTimeout(timeout)
  }
}
