import { describe, expect, it } from 'vitest'
import { buildEnrichedRequirementText, extractFeishuDocToken } from './feishuPrd.js'

describe('feishuPrd', () => {
  it('extracts wiki token', () => {
    const t = extractFeishuDocToken('https://bytedance.larkoffice.com/wiki/NTBZvM8Mbin5v8kvW2CzBKlNQR')
    expect(t?.type).toBe('wiki')
  })

  it('builds enriched requirement', () => {
    const out = buildEnrichedRequirementText({ original: 'x', prdText: 'y'.repeat(2000), maxChars: 1200 })
    expect(out).toContain('PRD 原文（自动抓取）：')
  })
})

