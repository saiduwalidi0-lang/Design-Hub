import { describe, expect, it } from 'vitest'
import { parseUserText } from './feishu.js'

describe('parseUserText', () => {
  it('parses style and count', () => {
    const r = parseUserText('做一个KV\n风格：深色高级感\n数量：8')
    expect(r.requirementText).toContain('做一个KV')
    expect(r.styleHint).toBe('深色高级感')
    expect(r.imageCount).toBe(8)
  })
})

