export function stripHtml(input: string | undefined): string | undefined {
  if (!input) return undefined
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function clampText(input: string, max: number): string {
  const t = input.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function buildSearchQuery(
  requirementText: string,
  styleHint?: string,
): string {
  const raw = `${requirementText} ${styleHint ?? ''}`
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\t]+/g, ' ')
    .replace(/[/\\:|]+/g, ' ')
    .replace(/[[\]{}()<>"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!raw) return 'poster design inspiration'
  return raw.length > 80 ? raw.slice(0, 80) : raw
}
