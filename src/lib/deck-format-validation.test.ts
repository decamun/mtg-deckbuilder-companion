import { describe, expect, it } from 'vitest'
import {
  colorIdentityScryfallClause,
  getFormatValidationDataVersion,
  getFormatValidationStatus,
  isFormatValidationImplemented,
  normalizeFormatForValidation,
  validateDeckForFormat,
} from '@/lib/deck-format-validation'
import { MAINBOARD_ZONE_ID, MAYBEBOARD_ZONE_ID, SIDEBOARD_ZONE_ID } from '@/lib/zones'

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
    expect(result.status).toBe('not_yet_implemented')
    expect(result.violationsByCardId.size).toBe(0)
    expect(result.deckViolations).toEqual(['Standard validation is not yet implemented.'])
  })

  it('maps selectable formats to explicit validation statuses', () => {
    expect(getFormatValidationStatus('edh')).toBe('implemented')
    expect(getFormatValidationStatus('commander')).toBe('implemented')
    expect(getFormatValidationStatus('standard')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('modern')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('pioneer')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('legacy')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('vintage')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('pauper')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('other')).toBe('neutral')
    expect(getFormatValidationStatus(null)).toBe('neutral')
    expect(isFormatValidationImplemented('edh')).toBe(true)
    expect(isFormatValidationImplemented('standard')).toBe(false)
    expect(getFormatValidationDataVersion('edh')).toContain('game-changers:')
    expect(getFormatValidationDataVersion('standard')).toBeNull()
  })

  it('flags commander singleton, color identity, banned, and bracket game-changer violations', () => {
    const cards = [
      {
        id: 'commander',
        scryfall_id: 'cmd-id',
        oracle_id: 'cmd-oracle',
        name: 'Commander',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'off-color',
        scryfall_id: 'off-id',
        oracle_id: 'off-oracle',
        name: 'Off Color',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['U'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'banned',
        scryfall_id: 'ban-id',
        oracle_id: 'ban-oracle',
        name: 'Banned Card',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'banned' },
      },
      {
        id: 'singleton-1',
        scryfall_id: 'single-1',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'singleton-2',
        scryfall_id: 'single-2',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate Printing',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'game-changer',
        scryfall_id: 'gc-id',
        oracle_id: 'gc-oracle',
        name: 'Rhystic Study',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
    ]

    const result = validateDeckForFormat('edh', {
      cards,
      commanderScryfallIds: ['cmd-id'],
      bracket: 1,
    })

    expect(result.status).toBe('implemented')
    expect(result.deckViolations).toEqual([])
    expect(result.dataVersion).toContain('edh-live-legalities+scryfall')
    expect(result.violationsByCardId.get('commander')).toBeUndefined()
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

  it('fails loudly when commander legality payload is missing', () => {
    const result = validateDeckForFormat('edh', {
      cards: [
        {
          id: 'missing-legalities',
          scryfall_id: 'missing-id',
          oracle_id: 'missing-oracle',
          name: 'Unknown Legality',
          quantity: 1,
          zone: MAINBOARD_ZONE_ID,
          color_identity: ['G'],
        },
      ],
      commanderScryfallIds: [],
    })

    expect(result.violationsByCardId.get('missing-legalities')).toContain(
      'Cannot validate Commander legality: missing data from Scryfall',
    )
  })

  it('does not apply commander singleton rule to maybeboard copies', () => {
    const cards = [
      {
        id: 'main-copy',
        scryfall_id: 'single-1',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
      {
        id: 'maybe-copy',
        scryfall_id: 'single-2',
        oracle_id: 'singleton-oracle',
        name: 'Duplicate Printing',
        quantity: 1,
        zone: MAYBEBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
    ]

    const result = validateDeckForFormat('edh', {
      cards,
      commanderScryfallIds: ['cmd-id'],
      bracket: null,
    })

    expect(result.violationsByCardId.get('main-copy')).toBeUndefined()
    expect(result.violationsByCardId.get('maybe-copy')).toBeUndefined()
  })

  it('validates sideboard max size only for formats where sideboard exists', () => {
    const cards = [
      {
        id: 'side-over',
        scryfall_id: 'side-id',
        oracle_id: 'side-oracle',
        name: 'Side Card',
        quantity: 16,
        zone: SIDEBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { commander: 'legal' },
      },
    ]

    const standard = validateDeckForFormat('standard', { cards, commanderScryfallIds: [] })
    expect(standard.deckViolations).toContain('Sideboard exceeds max 15 cards (has 16).')

    const commander = validateDeckForFormat('commander', { cards, commanderScryfallIds: [] })
    expect(commander.deckViolations).toEqual([])
  })
})
