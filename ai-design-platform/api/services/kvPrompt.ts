import type { CreateTaskInput } from '../types.js'
import type { VisualDirection } from './designSpecGenerator.js'

function pickPaletteWords(direction: VisualDirection): string {
  return direction.palette
    .slice(0, 5)
    .map((p) => `${p.name} ${p.hex}`)
    .join(', ')
}

function safeOneLine(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractReferenceInsight(requirementText: string): string {
  const idx = requirementText.indexOf('参考图识别：')
  if (idx < 0) return ''
  const after = requirementText.slice(idx + '参考图识别：'.length)
  const lines = after
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return safeOneLine(lines.slice(0, 12).join(' '))
}

function isReviseMode(requirementText: string): boolean {
  return requirementText.includes('模式：基于参考图改版') || requirementText.includes('基于参考图改版')
}

export function buildKvPromptFromDirection(input: CreateTaskInput, direction: VisualDirection): string {
  const firstLine = input.requirementText.split(/\r?\n/)[0] ?? input.requirementText
  const topic = safeOneLine(firstLine)
  const styleHint = safeOneLine(input.styleHint ?? '')
  const refInsight = extractReferenceInsight(input.requirementText)
  const revise = isReviseMode(input.requirementText)

  const palette = pickPaletteWords(direction)
  const motifs = direction.motifs.slice(0, 4).join(', ')
  const texture = direction.texture.slice(0, 3).join(', ')
  const composition = direction.composition.slice(0, 3).join(', ')

  const prompt = [
    `key visual illustration for: ${topic}`,
    styleHint ? `style: ${styleHint}` : '',
    refInsight ? `reference: ${refInsight}` : '',
    revise
      ? 'image-to-image revision: keep subject identity and key motifs from the reference, but make the requested change obvious; strongly re-imagine environment, lighting and color mood while preserving recognizability'
      : '',
    `direction: ${safeOneLine(direction.name)}; ${safeOneLine(direction.tagline)}`,
    `motifs: ${motifs}`,
    `materials: ${texture}`,
    `composition: ${composition}`,
    palette ? `color palette: ${palette}` : '',
    'design mockup, cinematic lighting, high detail, premium, modern graphic design',
    'no text, no watermark, no logo, no signature',
  ]
    .filter(Boolean)
    .join(', ')

  return prompt
}
