type Draft = {
  requirementText: string
  styleHint?: string
  imageCount?: number
  prdSource?: string
  imageInsight?: string
  lastTaskId?: string
  updatedAt: number
}

const drafts = new Map<string, Draft>()

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function isGenerateSignal(text: string): boolean {
  const t = norm(text)
  return (
    t === '开始生成' ||
    t === '开始生成方案' ||
    t === '生成' ||
    t === '生成方案' ||
    t === '/go' ||
    t === 'go'
  )
}

export function isResetSignal(text: string): boolean {
  const t = norm(text)
  return t === '重置' || t === '清空' || t === '/reset'
}

export function isFrontendSignal(text: string): boolean {
  const t = norm(text)
  return t === '前端' || t === '打开前端' || t === 'web' || t === '/web'
}

export function isLastResultSignal(text: string): boolean {
  const t = norm(text)
  return t === '上次' || t === '上次链接' || t === '结果链接' || t === '链接'
}

export function upsertDraft(key: string, patch: Omit<Draft, 'updatedAt'> & { updatedAt?: number }): Draft {
  const prev = drafts.get(key)
  const next: Draft = {
    requirementText: patch.requirementText ?? prev?.requirementText ?? '',
    styleHint: patch.styleHint ?? prev?.styleHint,
    imageCount: patch.imageCount ?? prev?.imageCount,
    prdSource: patch.prdSource ?? prev?.prdSource,
    imageInsight: patch.imageInsight ?? prev?.imageInsight,
    lastTaskId: patch.lastTaskId ?? prev?.lastTaskId,
    updatedAt: patch.updatedAt ?? Date.now(),
  }
  drafts.set(key, next)
  return next
}

export function getDraft(key: string): Draft | null {
  return drafts.get(key) ?? null
}

export function clearDraft(key: string): void {
  drafts.delete(key)
}

export function compactDraftPreview(d: Draft): string {
  const head = d.requirementText.replace(/\s+/g, ' ').slice(0, 80)
  const parts = [
    head ? `需求：${head}${d.requirementText.length > head.length ? '…' : ''}` : '',
    d.styleHint ? `风格：${d.styleHint}` : '',
    d.imageCount ? `数量：${d.imageCount}` : '',
    d.prdSource ? `PRD：${d.prdSource}` : '',
    d.imageInsight ? `图片识别：${d.imageInsight.replace(/\s+/g, ' ').slice(0, 60)}…` : '',
  ].filter(Boolean)
  return parts.join('\n')
}
