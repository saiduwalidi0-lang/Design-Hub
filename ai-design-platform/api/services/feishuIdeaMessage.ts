import type { DesignTask } from '../types.js'

function firstLineAfter(md: string, heading: string): string | null {
  const idx = md.indexOf(heading)
  if (idx < 0) return null
  const rest = md.slice(idx + heading.length)
  const lines = rest.split(/\r?\n/)
  for (const l of lines) {
    const t = l.trim()
    if (!t) continue
    if (t.startsWith('#')) continue
    return t
  }
  return null
}

function linesAfter(md: string, heading: string, max: number): string[] {
  const idx = md.indexOf(heading)
  if (idx < 0) return []
  const rest = md.slice(idx + heading.length)
  const lines = rest.split(/\r?\n/)
  const out: string[] = []
  for (const l of lines) {
    const t = l.trim()
    if (!t) continue
    if (t.startsWith('#')) break
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

function extractDirections(md: string): Array<{
  name: string
  tagline?: string
  keywords: string[]
  kvUrls: string[]
}> {
  const out: Array<{ name: string; tagline?: string; keywords: string[]; kvUrls: string[] }> = []
  const reSection = /(^|\n)## Direction \d+：([^\n]+)\n([\s\S]*?)(?=(\n## Direction \d+：|$))/g
  let m: RegExpExecArray | null
  while ((m = reSection.exec(md))) {
    const name = (m[2] ?? '').trim()
    const section = m[3] ?? ''
    if (!name) continue

    const taglineMatch = section.match(/\*\*一句话方向\*\*：(.+?)\r?\n/)
    const tagline = taglineMatch?.[1]?.trim()

    const keywords: string[] = []
    const kwIdx = section.indexOf('### Keywords')
    if (kwIdx >= 0) {
      const after = section.slice(kwIdx).split(/\r?\n/)
      for (const line of after) {
        const t = line.trim()
        if (t.startsWith('### ') && t !== '### Keywords') break
        const mk = t.match(/^[-*]\s+(.+)$/)
        if (mk?.[1]) keywords.push(mk[1].trim())
        if (keywords.length >= 10) break
      }
    }

    const kvUrls: string[] = []
    const kvIdx = section.indexOf('### KV 示意图')
    if (kvIdx >= 0) {
      const kvPart = section.slice(kvIdx, kvIdx + 1500)
      const reImg = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g
      let mi: RegExpExecArray | null
      while ((mi = reImg.exec(kvPart))) {
        kvUrls.push(mi[1])
        if (kvUrls.length >= 2) break
      }
    }

    out.push({ name, tagline, keywords, kvUrls })
    if (out.length >= 3) break
  }
  return out
}

export function buildIdeaMessage(task: DesignTask): string {
  const md = task.designSpecMarkdown || ''
  const topic = firstLineAfter(md, '## 主题识别')
  const modeLines = linesAfter(md, '## 生成方式', 2)
  const mode = modeLines[0] || null
  const modeNote = modeLines[1] && modeLines[1].startsWith('（') ? modeLines[1] : null
  const dirs = extractDirections(md)

  const lines: string[] = []
  lines.push('我先给你一个更“口头”的方向建议（自动生成）')
  if (mode) lines.push(`生成方式：${mode.replace(/\s+/g, ' ')}`)
  if (modeNote) lines.push(modeNote)
  if (topic) lines.push(`主题：${topic}`)
  lines.push('')

  dirs.forEach((d, i) => {
    lines.push(`方向 ${i + 1}（${d.name}）`)
    if (d.tagline) lines.push(`一句话：${d.tagline}`)
    if (d.keywords.length) lines.push(`关键词：${d.keywords.slice(0, 8).join(' / ')}`)
    lines.push('')
  })

  lines.push('你如果要我继续收敛：回我“更史诗 / 更克制 / 更潮流 / 更极简”任选其一。')
  return lines.join('\n').trim()
}

export function extractIdeaKvUrls(task: DesignTask): string[] {
  const md = task.designSpecMarkdown || ''
  const dirs = extractDirections(md)
  const urls: string[] = []
  for (const d of dirs) {
    for (const u of d.kvUrls) {
      if (urls.includes(u)) continue
      urls.push(u)
      if (urls.length >= 6) return urls
    }
  }
  return urls
}
