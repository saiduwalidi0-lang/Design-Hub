import { describe, expect, it } from 'vitest'
import { parseFigmaFileKey } from './figma.js'

describe('parseFigmaFileKey', () => {
  it('parses file key', () => {
    expect(parseFigmaFileKey('https://www.figma.com/file/AbCdEf12/Hello?node-id=1-2')).toBe('AbCdEf12')
  })

  it('parses design key', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/XYZ987/Hello')).toBe('XYZ987')
  })

  it('returns null for non-figma', () => {
    expect(parseFigmaFileKey('https://example.com/file/AbCdEf12/Hello')).toBe(null)
  })
})

