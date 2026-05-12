import { describe, expect, it } from 'vitest'
import { ALL_MODELS, isModelId } from '@/lib/agent-quota'
import { isValidEdhrecSlug } from '@/lib/edhrec'

describe('agent quota model id validation', () => {
  it('accepts all configured model ids and rejects unknown values', () => {
    for (const model of ALL_MODELS) {
      expect(isModelId(model)).toBe(true)
    }
    expect(isModelId('unknown/model')).toBe(false)
    expect(isModelId(null)).toBe(false)
  })
})

describe('edhrec slug validation', () => {
  it('accepts valid slugs and rejects unsafe formats', () => {
    expect(isValidEdhrecSlug('atraxa-praetors-voice')).toBe(true)
    expect(isValidEdhrecSlug('A traxa')).toBe(false)
    expect(isValidEdhrecSlug('../secret')).toBe(false)
    expect(isValidEdhrecSlug('atraxa%2fpraetors-voice')).toBe(false)
    expect(isValidEdhrecSlug('atraxa.praetors')).toBe(false)
    expect(isValidEdhrecSlug('')).toBe(false)
    expect(isValidEdhrecSlug('a'.repeat(121))).toBe(false)
  })
})
