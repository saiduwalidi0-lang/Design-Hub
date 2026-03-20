import { describe, expect, it } from 'vitest'
import { normalizeQueryToEnTags } from './queryNormalize.js'

describe('normalizeQueryToZhTags', () => {
  it('maps english synonyms to chinese tags', () => {
    const r = normalizeQueryToEnTags('dark cyberpunk poster banner')
    expect(r.tags).toContain('dark')
    expect(r.tags).toContain('cyberpunk')
    expect(r.tags).toContain('poster')
    expect(r.tags).toContain('banner')
  })

  it('keeps chinese keywords', () => {
    const r = normalizeQueryToEnTags('电商 直播 弹窗')
    expect(r.tags).toContain('ecommerce')
    expect(r.tags).toContain('livestream')
    expect(r.tags).toContain('popup')
  })
})
