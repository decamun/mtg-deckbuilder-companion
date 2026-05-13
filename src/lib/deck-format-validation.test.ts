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
  it('returns neutral status for unknown formats', () => {
    const result = validateDeckForFormat('totally-unknown-format', {
      cards: [],
      commanderScryfallIds: [],
    })
    expect(result.status).toBe('neutral')
    expect(result.violationsByCardId.size).toBe(0)
    expect(result.deckViolations).toEqual([])
  })

  it('maps selectable formats to explicit validation statuses', () => {
    expect(getFormatValidationStatus('edh')).toBe('implemented')
    expect(getFormatValidationStatus('commander')).toBe('implemented')
    expect(getFormatValidationStatus('standard')).toBe('implemented')
    expect(getFormatValidationStatus('modern')).toBe('implemented')
    expect(getFormatValidationStatus('pioneer')).toBe('implemented')
    expect(getFormatValidationStatus('legacy')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('vintage')).toBe('not_yet_implemented')
    expect(getFormatValidationStatus('pauper')).toBe('implemented')
    expect(getFormatValidationStatus('other')).toBe('neutral')
    expect(getFormatValidationStatus(null)).toBe('neutral')
    expect(isFormatValidationImplemented('edh')).toBe(true)
    expect(isFormatValidationImplemented('standard')).toBe(true)
    expect(getFormatValidationDataVersion('edh')).toContain('game-changers:')
    expect(getFormatValidationDataVersion('standard')).toBe('standard-live-legalities+scryfall')
    expect(getFormatValidationDataVersion('pauper')).toBe('pauper-live-legalities+scryfall')
  })

  it('flags constructed format legality, 5th copy, 61-card mainboard, and oversized sideboard', () => {
    const cards = [
      {
        id: 'banned-standard',
        scryfall_id: 'banned-standard-printing',
        oracle_id: 'banned-standard-oracle',
        name: 'Banned Card',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        legalities: { standard: 'banned' },
      },
      {
        id: 'not-legal-standard',
        scryfall_id: 'not-legal-standard-printing',
        oracle_id: 'not-legal-standard-oracle',
        name: 'Not Legal Card',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        legalities: { standard: 'not_legal' },
      },
      {
        id: 'playset-legal',
        scryfall_id: 'playset-legal-printing',
        oracle_id: 'playset-legal-oracle',
        name: 'Legal Playset Card',
        quantity: 4,
        zone: MAINBOARD_ZONE_ID,
        legalities: { standard: 'legal' },
      },
      {
        id: 'fifth-copy-main',
        scryfall_id: 'fifth-copy-main-printing',
        oracle_id: 'fifth-copy-oracle',
        name: 'Fifth Copy Card',
        quantity: 4,
        zone: MAINBOARD_ZONE_ID,
        legalities: { standard: 'legal' },
      },
      {
        id: 'fifth-copy-side',
        scryfall_id: 'fifth-copy-side-printing',
        oracle_id: 'fifth-copy-oracle',
        name: 'Fifth Copy Card',
        quantity: 1,
        zone: SIDEBOARD_ZONE_ID,
        legalities: { standard: 'legal' },
      },
      {
        id: 'filler-main',
        scryfall_id: 'filler-main-printing',
        oracle_id: 'filler-main-oracle',
        name: 'Filler',
        quantity: 51,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Basic Land — Plains',
        legalities: { standard: 'legal' },
      },
      {
        id: 'oversized-sideboard',
        scryfall_id: 'oversized-sideboard-printing',
        oracle_id: 'oversized-sideboard-oracle',
        name: 'Sideboard Card',
        quantity: 16,
        zone: SIDEBOARD_ZONE_ID,
        legalities: { standard: 'legal' },
      },
    ]

    const result = validateDeckForFormat('standard', {
      cards,
      commanderScryfallIds: [],
      bracket: null,
    })

    expect(result.status).toBe('implemented')
    expect(result.deckViolations).toContain('Mainboard must contain exactly 60 cards (has 61).')
    expect(result.deckViolations).toContain('Sideboard exceeds max 15 cards (has 17).')
    expect(result.violationsByCardId.get('banned-standard')).toContain('Banned in Standard')
    expect(result.violationsByCardId.get('not-legal-standard')).toContain('Not legal in Standard')
    expect(result.violationsByCardId.get('playset-legal')).toBeUndefined()
    expect(result.violationsByCardId.get('fifth-copy-main')).toContain(
      'More than 4 copies in validated deck zones',
    )
    expect(result.violationsByCardId.get('fifth-copy-side')).toContain(
      'More than 4 copies in validated deck zones',
    )
  })

  it('excludes maybeboard from standard 60/4/15 counting and legality checks', () => {
    const result = validateDeckForFormat('standard', {
      cards: [
        {
          id: 'main-basics',
          scryfall_id: 'main-basics-printing',
          oracle_id: 'main-basics-oracle',
          name: 'Plains',
          quantity: 56,
          zone: MAINBOARD_ZONE_ID,
          type_line: 'Basic Land — Plains',
          legalities: { standard: 'legal' },
        },
        {
          id: 'main-playset',
          scryfall_id: 'main-playset-printing',
          oracle_id: 'shared-oracle',
          name: 'Main Playset',
          quantity: 4,
          zone: MAINBOARD_ZONE_ID,
          legalities: { standard: 'legal' },
        },
        {
          id: 'sideboard-15',
          scryfall_id: 'sideboard-15-printing',
          oracle_id: 'sideboard-15-oracle',
          name: 'Sideboard Basics',
          quantity: 15,
          zone: SIDEBOARD_ZONE_ID,
          type_line: 'Basic Land — Plains',
          legalities: { standard: 'legal' },
        },
        {
          id: 'maybe-copy',
          scryfall_id: 'maybe-copy-printing',
          oracle_id: 'shared-oracle',
          name: 'Maybeboard Copy',
          quantity: 99,
          zone: MAYBEBOARD_ZONE_ID,
          legalities: { standard: 'legal' },
        },
        {
          id: 'maybe-banned',
          scryfall_id: 'maybe-banned-printing',
          oracle_id: 'maybe-banned-oracle',
          name: 'Maybeboard Banned',
          quantity: 50,
          zone: MAYBEBOARD_ZONE_ID,
          legalities: { standard: 'banned' },
        },
      ],
      commanderScryfallIds: [],
    })

    expect(result.deckViolations).toEqual([])
    expect(result.violationsByCardId.get('main-playset')).toBeUndefined()
    expect(result.violationsByCardId.get('maybe-copy')).toBeUndefined()
    expect(result.violationsByCardId.get('maybe-banned')).toBeUndefined()
  })

  it('uses per-format Scryfall legality for Pioneer and Modern', () => {
    const cards = [
      {
        id: 'format-legality-card',
        scryfall_id: 'format-legality-printing',
        oracle_id: 'format-legality-oracle',
        name: 'Format Legality Card',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        legalities: { pioneer: 'banned', modern: 'not_legal' },
      },
      {
        id: 'format-filler',
        scryfall_id: 'format-filler-printing',
        oracle_id: 'format-filler-oracle',
        name: 'Format Filler',
        quantity: 59,
        zone: MAINBOARD_ZONE_ID,
        type_line: 'Basic Land — Plains',
        legalities: { pioneer: 'legal', modern: 'legal' },
      },
    ]

    const pioneerResult = validateDeckForFormat('pioneer', { cards, commanderScryfallIds: [] })
    expect(pioneerResult.status).toBe('implemented')
    expect(pioneerResult.deckViolations).toEqual([])
    expect(pioneerResult.violationsByCardId.get('format-legality-card')).toContain('Banned in Pioneer')

    const modernResult = validateDeckForFormat('modern', { cards, commanderScryfallIds: [] })
    expect(modernResult.status).toBe('implemented')
    expect(modernResult.deckViolations).toEqual([])
    expect(modernResult.violationsByCardId.get('format-legality-card')).toContain('Not legal in Modern')
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
    expect(result.deckViolations).toContain('Mainboard must contain exactly 60 cards (has 59).')
  })

  it('does not apply 60-card mainboard rule to non-constructed formats', () => {
    const cards = [
      {
        id: 'short-mainboard-legacy',
        scryfall_id: 'short-mainboard-legacy-id',
        oracle_id: 'short-mainboard-legacy-oracle',
        name: 'Short Mainboard Legacy',
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        color_identity: ['G'],
        legalities: { legacy: 'legal' },
      },
    ]

    const result = validateDeckForFormat('legacy', { cards, commanderScryfallIds: [] })
    expect(result.deckViolations).not.toContain('Mainboard must contain exactly 60 cards (has 1).')
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
