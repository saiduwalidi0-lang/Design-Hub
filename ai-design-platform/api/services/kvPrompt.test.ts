import { describe, expect, it } from 'vitest'
import { buildKvPromptFromDirection } from './kvPrompt.js'

describe('buildKvPromptFromDirection', () => {
  it('includes reference insight and revise constraints', () => {
    const prompt = buildKvPromptFromDirection(
      {
        requirementText: 'x\n\n模式：基于参考图改版\n\n参考图识别：\n主体：奖杯\n配色：蓝金\n',
        styleHint: '高级感',
        imageCount: 6,
      },
      {
        name: 'A',
        tagline: 'B',
        keywords: [],
        storytelling: '',
        palette: [{ name: 'Blue', hex: '#0000FF', usage: 'bg' }],
        typography: [],
        motifs: ['trophy'],
        texture: ['metal'],
        composition: ['center'],
        imageQueries: ['x'],
      },
    )
    expect(prompt).toContain('reference:')
    expect(prompt).toContain('image-to-image revision')
  })
})
