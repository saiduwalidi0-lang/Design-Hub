import { describe, expect, it } from 'vitest'
import { buildVisualDirections, generateDesignSpecMarkdown, generateDesignSpecMarkdownFromDirections } from './designSpecGenerator.js'

describe('generateDesignSpecMarkdown', () => {
  it('includes sections and reference table', () => {
    const md = generateDesignSpecMarkdown(
      {
        requirementText: '做一个活动海报灵感收集平台，支持参考图与方案输出',
        styleHint: '极简',
        imageCount: 6,
      },
      [
        {
          url: 'https://example.com/a.jpg',
          thumbnailUrl: 'https://example.com/a_t.jpg',
          title: 'A',
          source: 'Wikimedia Commons',
          pageUrl: 'https://example.com/page',
        },
      ],
    )

    expect(md).toContain('# 视觉设计方案（自动生成）')
    expect(md).toContain('## 主题识别')
    expect(md).toContain('## Atmosphere Direction')
    expect(md).toContain('## 参考图清单')
    expect(md).toContain('| # | 标题 | 来源 | 链接 |')
  })

  it('renders kv section when provided', () => {
    const input = {
      requirementText: '做一个活动海报灵感收集平台，支持参考图与方案输出',
      styleHint: '极简',
      imageCount: 6,
    }
    const directions = buildVisualDirections(input)
    const md = generateDesignSpecMarkdownFromDirections(input, {
      generationMode: 'template',
      directions,
      images: [],
      kvByDirection: {
        [directions[0].name]: [
          {
            url: 'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=x&image_size=landscape_16_9',
            thumbnailUrl: 'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=x&image_size=landscape_16_9',
            title: 'KV',
            source: 'AI Generated',
          },
        ],
      },
    })
    expect(md).toContain('### KV 示意图')
    expect(md).toContain('copilot-cn.bytedance.net/api/ide/v1/text_to_image')
  })
})
