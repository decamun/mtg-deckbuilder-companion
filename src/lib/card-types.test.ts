import { describe, expect, it } from 'vitest'
import {
  getCardTypeGroup,
  hasLandFaceOnTypeLine,
  primaryTypeLine,
  typeLineFaces,
} from '@/lib/card-types'

describe('card type helpers', () => {
  it.each([
    ['Instant // Sorcery', 'Instant'],
    ['Creature — Human Peasant // Instant — Adventure', 'Creature — Human Peasant'],
    ['Artifact // Land', 'Artifact'],
  ])('uses the left face as the primary type line for %j', (typeLine, expected) => {
    expect(primaryTypeLine(typeLine)).toBe(expected)
  })

  it.each([
    ['Instant // Sorcery', 'Instant'],
    ['Creature — Human Peasant // Instant — Adventure', 'Creature'],
    ['Artifact Creature — Golem', 'Creature'],
    ['Land Creature — Forest Dryad', 'Creature'],
    ['Kindred — Rogue', 'Other'],
  ])('groups %j as %s', (typeLine, expected) => {
    expect(getCardTypeGroup(typeLine)).toBe(expected)
  })

  it('splits all faces for split, adventure, and MDFC-style type lines', () => {
    expect(typeLineFaces('Instant // Sorcery')).toEqual(['Instant', 'Sorcery'])
    expect(typeLineFaces('Creature — Human Peasant // Instant — Adventure')).toEqual([
      'Creature — Human Peasant',
      'Instant — Adventure',
    ])
    expect(typeLineFaces('Creature — Cat // Land')).toEqual(['Creature — Cat', 'Land'])
  })

  it.each([
    ['Creature — Cat // Land', true],
    ['Land // Sorcery', true],
    ['Instant // Sorcery', false],
    [undefined, false],
  ])('detects land faces for %j', (typeLine, expected) => {
    expect(hasLandFaceOnTypeLine(typeLine)).toBe(expected)
  })
})
