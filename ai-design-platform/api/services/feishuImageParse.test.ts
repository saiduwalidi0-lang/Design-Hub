import { describe, expect, it } from 'vitest'
import { parseImageKeyFromMessageContent } from './feishu.js'

describe('parseImageKeyFromMessageContent', () => {
  it('returns image_key', () => {
    expect(parseImageKeyFromMessageContent('{"image_key":"img_xxx"}')).toBe('img_xxx')
  })
})

