import { describe, expect, it } from 'vitest'
import {
  colorIdentityScryfallClause,
  getConstructedCopyLimitViolations,
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
    expect(getFormatValidationStatus('pauper')).toBe('implemented')
    expect(getFormatValidationStatus('other')).toBe('neutral')
    expect(getFormatValidationStatus(null)).toBe('neutral')
    expect(isFormatValidationImplemented('edh')).toBe(true)
    expect(isFormatValidationImplemented('standard')).toBe(false)
    expect(getFormatValidationDataVersion('edh')).toContain('game-changers:')
    expect(getFormatValidationDataVersion('pauper')).toBe('pauper-live-legalities+scryfall')
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

  it('validates pauper legality and copy limits across validated zones while excluding maybeboard', () => {
    const cards = [
      {
        id: 'main-filler',
        scryfall_id: 'main-filler-id',
        oracle_id: 'main-filler-oracle',
        name: 'Main Filler',
        quantity: 56,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'legal' },
      },
      {
        id: 'banned-main',
        scryfall_id: 'banned-main-id',
        oracle_id: 'banned-main-oracle',
        name: 'Banned Main',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'banned' },
      },
      {
        id: 'not-legal-side',
        scryfall_id: 'not-legal-side-id',
        oracle_id: 'not-legal-side-oracle',
        name: 'Not Legal Side',
        quantity: 1,
        zone: SIDEBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'not_legal' },
      },
      {
        id: 'dup-main',
        scryfall_id: 'dup-main-id',
        oracle_id: 'dup-oracle',
        name: 'Duplicate Main',
        quantity: 3,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'legal' },
      },
      {
        id: 'dup-side',
        scryfall_id: 'dup-side-id',
        oracle_id: 'dup-oracle',
        name: 'Duplicate Side',
        quantity: 2,
        zone: SIDEBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'legal' },
      },
      {
        id: 'dup-maybe',
        scryfall_id: 'dup-maybe-id',
        oracle_id: 'dup-oracle',
        name: 'Duplicate Maybe',
        quantity: 99,
        zone: MAYBEBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'legal' },
      },
    ]

    const result = validateDeckForFormat('pauper', { cards, commanderScryfallIds: [] })

    expect(result.status).toBe('implemented')
    expect(result.deckViolations).toEqual([])
    expect(result.violationsByCardId.get('banned-main')).toContain('Banned in Pauper')
    expect(result.violationsByCardId.get('not-legal-side')).toContain('Not legal in Pauper')
    expect(result.violationsByCardId.get('dup-main')).toContain(
      'More than 4 copies in validated deck zones',
    )
    expect(result.violationsByCardId.get('dup-side')).toContain(
      'More than 4 copies in validated deck zones',
    )
    expect(result.violationsByCardId.get('dup-maybe')).toBeUndefined()
  })

  it('requires at least 60 mainboard cards in pauper', () => {
    const cards = [
      {
        id: 'short-mainboard',
        scryfall_id: 'short-mainboard-id',
        oracle_id: 'short-mainboard-oracle',
        name: 'Short Mainboard',
        quantity: 59,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { pauper: 'legal' },
      },
    ]

    const result = validateDeckForFormat('pauper', { cards, commanderScryfallIds: [] })
    expect(result.deckViolations).toContain('Mainboard must contain at least 60 cards (has 59)')
  })

  it('does not apply pauper mainboard minimum to other formats', () => {
    const cards = [
      {
        id: 'short-mainboard-standard',
        scryfall_id: 'short-mainboard-standard-id',
        oracle_id: 'short-mainboard-standard-oracle',
        name: 'Short Mainboard Standard',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { standard: 'legal' },
      },
    ]

    const result = validateDeckForFormat('standard', { cards, commanderScryfallIds: [] })
    expect(result.deckViolations).not.toContain('Mainboard must contain at least 60 cards (has 1)')
  })
})

describe('getConstructedCopyLimitViolations', () => {
  it('aggregates split/MDFC/adventure copies by oracle id across mainboard + sideboard', () => {
    const result = getConstructedCopyLimitViolations('standard', [
      {
        id: 'split-main',
        scryfall_id: 'split-main-printing',
        oracle_id: 'split-oracle',
        name: 'Fire // Ice',
        quantity: 3,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Instant // Instant',
      },
      {
        id: 'split-side',
        scryfall_id: 'split-side-printing',
        oracle_id: 'split-oracle',
        name: 'Fire // Ice',
        quantity: 2,
        zone: SIDEBOARD_ZONE_ID,
        type_line: 'Instant // Instant',
      },
      {
        id: 'mdfc-main',
        scryfall_id: 'mdfc-main-printing',
        oracle_id: 'mdfc-oracle',
        name: 'Bala Ged Recovery // Bala Ged Sanctuary',
        quantity: 2,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Sorcery // Land',
      },
      {
        id: 'mdfc-side',
        scryfall_id: 'mdfc-side-printing',
        oracle_id: 'mdfc-oracle',
        name: 'Bala Ged Recovery // Bala Ged Sanctuary',
        quantity: 3,
        zone: SIDEBOARD_ZONE_ID,
        type_line: 'Sorcery // Land',
      },
      {
        id: 'adventure-main',
        scryfall_id: 'adventure-main-printing',
        oracle_id: 'adventure-oracle',
        name: 'Bonecrusher Giant // Stomp',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Creature — Giant // Instant — Adventure',
      },
      {
        id: 'adventure-side',
        scryfall_id: 'adventure-side-printing',
        oracle_id: 'adventure-oracle',
        name: 'Bonecrusher Giant // Stomp',
        quantity: 4,
        zone: SIDEBOARD_ZONE_ID,
        type_line: 'Creature — Giant // Instant — Adventure',
      },
    ])

    expect(result.get('split-main')).toContain('More than 4 copies in validated deck zones')
    expect(result.get('split-side')).toContain('More than 4 copies in validated deck zones')
    expect(result.get('mdfc-main')).toContain('More than 4 copies in validated deck zones')
    expect(result.get('mdfc-side')).toContain('More than 4 copies in validated deck zones')
    expect(result.get('adventure-main')).toContain('More than 4 copies in validated deck zones')
    expect(result.get('adventure-side')).toContain('More than 4 copies in validated deck zones')
  })

  it('ignores maybeboard rows and any-number/basic exceptions', () => {
    const result = getConstructedCopyLimitViolations('standard', [
      {
        id: 'main-copy',
        scryfall_id: 'main-printing',
        oracle_id: 'same-oracle',
        name: 'Relentless Rats',
        quantity: 4,
        zone: MAINBOARD_ZONE_ID,
        oracle_text: 'A deck can have any number of cards named Relentless Rats.',
      },
      {
        id: 'maybe-copy',
        scryfall_id: 'maybe-printing',
        oracle_id: 'same-oracle',
        name: 'Relentless Rats',
        quantity: 99,
        zone: MAYBEBOARD_ZONE_ID,
        oracle_text: 'A deck can have any number of cards named Relentless Rats.',
      },
      {
        id: 'basic-main',
        scryfall_id: 'island-main',
        oracle_id: 'island-oracle',
        name: 'Island',
        quantity: 20,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Basic Land — Island',
      },
      {
        id: 'basic-side',
        scryfall_id: 'island-side',
        oracle_id: 'island-oracle',
        name: 'Island',
        quantity: 20,
        zone: SIDEBOARD_ZONE_ID,
        type_line: 'Basic Land — Island',
      },
    ])

    expect(result.size).toBe(0)
  })
})
