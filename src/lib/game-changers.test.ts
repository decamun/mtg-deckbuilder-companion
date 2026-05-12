import { describe, expect, it } from 'vitest'
import {
  BRACKET_GC_LIMIT,
  bracketHelperText,
  isGameChanger,
} from '@/lib/game-changers'

describe('game changers', () => {
  it('matches names case-insensitively', () => {
    expect(isGameChanger('Rhystic Study')).toBe(true)
    expect(isGameChanger('rhystic study')).toBe(true)
    expect(isGameChanger('Lightning Bolt')).toBe(false)
  })

  it('exposes the published bracket caps and helper text', () => {
    expect(BRACKET_GC_LIMIT[1]).toBe(0)
    expect(BRACKET_GC_LIMIT[3]).toBe(3)
    expect(BRACKET_GC_LIMIT[4]).toBe(Infinity)
    expect(bracketHelperText(1)).toBe('no game changers')
    expect(bracketHelperText(3)).toBe('max 3 game changers')
    expect(bracketHelperText(4)).toBe('unlimited game changers')
  })
})
