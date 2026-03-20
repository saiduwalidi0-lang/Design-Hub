import { describe, expect, it } from 'vitest'
import type { DesignTask } from '../types.js'
import { extractIdeaKvUrls } from './feishuIdeaMessage.js'

describe('extractIdeaKvUrls', () => {
  it('extracts kv urls from markdown', () => {
    const task: DesignTask = {
      id: 't1',
      requirementText: 'x',
      imageCount: 6,
      status: 'succeeded',
      referenceImages: [],
      designSpecMarkdown:
        '## Direction 1：A\n\n### KV 示意图（AI 生成）\n- ![KV](https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=x&image_size=landscape_16_9)\n',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const urls = extractIdeaKvUrls(task)
    expect(urls[0]).toContain('copilot-cn.bytedance.net/api/ide/v1/text_to_image')
  })
})

