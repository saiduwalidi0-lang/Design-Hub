import { describe, expect, it } from 'vitest'
import { isArkImageToImageConfigured, isArkTextToImageConfigured } from './arkImageProvider.js'

describe('arkImageProvider', () => {
  it('isArkImageConfigured is false without env', () => {
    expect(isArkTextToImageConfigured()).toBe(false)
    expect(isArkImageToImageConfigured()).toBe(false)
  })
})
