import { describe, expect, it } from 'vitest'
import {
  colorIdentityScryfallClause,
  normalizeFormatForValidation,
  validateDeckForFormat,
} from '@/lib/deck-format-validation'

describe('deck format validation helpers', () => {
  it('normalizes commander to edh and builds color clauses', () => {
    expect(normalizeFormatForValidation(' Commander ')).toBe('edh')
    expect(colorIdentityScryfallClause(['W', 'U', 'W'])).toBe('id<=wu')
    expect(colorIdentityScryfallClause([])).toBe('id=c')
  })
})

describe('validateDeckForFormat', () => {
  it('returns no violations for unsupported formats', () => {
    const result = validateDeckForFormat('standard', { cards: [], commanderScryfallIds: [] })
    expect(result.violationsByCardId.size).toBe(0)
  })

  it('flags commander singleton, color identity, banned, and bracket game-changer violations', () => {
    const cards = [
      {
        id: 'commander',
        scryfall_id: 'cmd-id',
        oracle_id: 'cmd-oracle',
        name: 'Commander',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'off-color',
        scryfall_id: 'off-id',
        oracle_id: 'off-oracle',
        name: 'Off Color',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['U'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'banned',
        scryfall_id: 'ban-id',
        oracle_id: 'ban-oracle',
        name: 'Banned Card',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['G'],
        legalities: { commander: 'banned' },
      },
      {
        id: 'singleton-1',
        scryfall_id: 'single-1',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'singleton-2',
        scryfall_id: 'single-2',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate Printing',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'game-changer',
        scryfall_id: 'gc-id',
        oracle_id: 'gc-oracle',
        name: 'Rhystic Study',
        quantity: 1,
        zone: 'mainboard',
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
    ]

    const result = validateDeckForFormat('edh', {
      cards,
      commanderScryfallIds: ['cmd-id'],
      bracket: 1,
    })

    expect(result.violationsByCardId.get('off-color')).toContain('Color identity outside commanders')
    expect(result.violationsByCardId.get('banned')).toContain('Banned in Commander')
    expect(result.violationsByCardId.get('singleton-1')).toContain(
      'More than one copy (Commander singleton rule)',
    )
    expect(result.violationsByCardId.get('singleton-2')).toContain(
      'More than one copy (Commander singleton rule)',
    )
    expect(result.violationsByCardId.get('game-changer')).toContain(
      'Bracket 1: max 0 game changers (deck has 1)',
    )
  })
})
