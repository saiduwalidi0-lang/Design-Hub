function normSpaces(s: string): string {
  return String(s || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniq<T>(arr: T[]): T[] {
  const out: T[] = []
  for (const x of arr) {
    if (!out.includes(x)) out.push(x)
  }
  return out
}

type Syn = { match: RegExp; tag: string }

const SYNONYMS: Syn[] = [
  { match: /\bkv\b|\bkey\s*visual\b|主kv/i, tag: 'kv' },
  { match: /\bposter\b|海报/i, tag: 'poster' },
  { match: /\bbanner\b|横幅/i, tag: 'banner' },
  { match: /\blanding\s*page\b|\blp\b|落地页/i, tag: 'landing_page' },
  { match: /\bpopup\b|\bmodal\b|弹窗/i, tag: 'popup' },
  { match: /\bfeed\b|\binfo\s*flow\b|信息流/i, tag: 'feed' },
  { match: /\bcard\b|卡片/i, tag: 'card' },
  { match: /\blive\s*stream\b|\blivestream\b|直播/i, tag: 'livestream' },
  { match: /\be-?commerce\b|电商/i, tag: 'ecommerce' },
  { match: /\bicon\b|图标/i, tag: 'icon' },
  { match: /\billustration\b|插画/i, tag: 'illustration' },
  { match: /\bphoto\b|\bphotography\b|摄影/i, tag: 'photography' },
  { match: /\b3d\b|三维/i, tag: '3d' },
  { match: /\bflat\b|扁平/i, tag: 'flat' },
  { match: /\bminimal\b|\bminimalism\b|极简/i, tag: 'minimal' },
  { match: /\bluxury\b|\bpremium\b|轻奢|高级/i, tag: 'luxury' },
  { match: /\bdark\b|\bdark\s*theme\b|暗黑/i, tag: 'dark' },
  { match: /\bcyber\s*punk\b|\bcyberpunk\b|赛博/i, tag: 'cyberpunk' },
  { match: /\bneon\b|霓虹/i, tag: 'neon' },
  { match: /\bgradient\b|渐变/i, tag: 'gradient' },
  { match: /\bmetal\b|\bmetallic\b|金属/i, tag: 'metal' },
  { match: /\bglass\b|\bglassmorphism\b|玻璃拟态|玻璃/i, tag: 'glassmorphism' },
  { match: /\btexture\b|质感|纹理/i, tag: 'texture' },
  { match: /\btypography\b|\btype\b|字体/i, tag: 'typography' },
  { match: /\blayout\b|版式|排版/i, tag: 'layout' },
  { match: /\bbranding\b|品牌/i, tag: 'branding' },
  { match: /\bfestival\b|节日|庆典/i, tag: 'festival' },
  { match: /\bgame\b|游戏/i, tag: 'game' },
]

export function normalizeQueryToEnTags(query: string): {
  original: string
  normalized: string
  tags: string[]
  terms: string[]
} {
  const original = normSpaces(query)
  const tags: string[] = []
  for (const s of SYNONYMS) {
    if (s.match.test(original)) tags.push(s.tag)
  }

  const cleaned = original
    .replace(/[#()[\]{}|\\/:;,.!?"'`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const asciiTokens = (cleaned.match(/[A-Za-z0-9]{2,}/g) ?? []).map((t) => t.toLowerCase())
  const cnTokens = (cleaned.match(/[\u4e00-\u9fff]{2,}/g) ?? []).map((t) => t.trim())

  const baseTerms = uniq([...tags.map((t) => t.toLowerCase()), ...asciiTokens, ...cnTokens])
    .filter(Boolean)
    .slice(0, 10)

  const normalized = uniq([...tags, ...asciiTokens, ...cnTokens]).join(' ').trim() || original

  return {
    original,
    normalized,
    tags: uniq(tags),
    terms: baseTerms,
  }
}
