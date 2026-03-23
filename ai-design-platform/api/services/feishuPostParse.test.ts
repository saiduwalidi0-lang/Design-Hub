import { describe, expect, it } from 'vitest'
import { parsePostContent } from './feishu.js'

describe('parsePostContent', () => {
  it('extracts text and image keys', () => {
    const raw = JSON.stringify({
      post: {
        zh_cn: {
          content: [
            [
              { tag: 'text', text: 'hello' },
              { tag: 'img', image_key: 'img_123' },
            ],
          ],
        },
      },
    })
    const r = parsePostContent(raw)
    expect(r.text).toContain('hello')
    expect(r.imageKeys).toContain('img_123')
  })
})

