import { describe, expect, it } from 'vitest'
import type { DeckRow } from '@/lib/deck-service'
import {
  MAINBOARD_ZONE_ID,
  MAYBEBOARD_ZONE_ID,
  SIDEBOARD_ZONE_ID,
} from '@/lib/zones'
import {
  buildManaCurveData,
  computeDeckStatsReport,
  countLandSources,
  getDeckStatCardType,
  isBasicLand,
  isLandTypeLine,
  isMdfcWithLandBack,
  type DeckStatsCard,
} from '@/lib/deck-stats-compute'

function makeCard(overrides: Partial<DeckStatsCard> = {}): DeckStatsCard {
  return {
    id: overrides.id ?? 'card-id',
    scryfall_id: overrides.scryfall_id ?? 'scryfall-id',
    name: overrides.name ?? 'Card Name',
    quantity: overrides.quantity ?? 1,
    zone: overrides.zone ?? MAINBOARD_ZONE_ID,
    type_line: overrides.type_line ?? 'Creature',
    mana_cost: overrides.mana_cost ?? '',
    oracle_text: overrides.oracle_text ?? '',
    colors: overrides.colors ?? [],
    tags: overrides.tags ?? [],
    color_identity: overrides.color_identity ?? [],
    legalities: overrides.legalities ?? { commander: 'legal' },
    price_usd: overrides.price_usd ?? 0,
    ...overrides,
  }
}

describe('deck stats compute helpers', () => {
  it('classifies cards by priority order and primary face', () => {
    expect(getDeckStatCardType('Artifact Creature — Golem')).toBe('Creature')
    expect(getDeckStatCardType('Instant // Sorcery')).toBe('Instant')
    expect(getDeckStatCardType('Land')).toBe('Land')
  })

  it('detects land type lines, basics, and MDFC land backs', () => {
    expect(isLandTypeLine('Basic Land — Forest')).toBe(true)
    expect(isLandTypeLine('Sorcery // Land')).toBe(false)
    expect(isBasicLand('Basic Land — Island')).toBe(true)
    expect(isBasicLand('Snow Land — Plains')).toBe(false)
    expect(isMdfcWithLandBack('Sorcery // Land')).toBe(true)
    expect(isMdfcWithLandBack('Land // Sorcery')).toBe(false)
    expect(
      countLandSources([
        makeCard({ quantity: 2, type_line: 'Basic Land — Forest' }),
        makeCard({ id: 'mdfc', scryfall_id: 'mdfc-id', type_line: 'Sorcery // Land' }),
        makeCard({ id: 'spell', scryfall_id: 'spell-id', type_line: 'Instant' }),
      ]),
    ).toBe(3)
  })
})

describe('computeDeckStatsReport', () => {
  it('produces a stable analytics summary for a small deck fixture', () => {
    const deck: DeckRow = {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Golden Deck',
      format: 'Commander',
      description: null,
      is_public: false,
      budget_usd: null,
      bracket: 3,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: ['cmd-id'],
      primer_markdown: '',
      created_at: '2026-01-01T00:00:00.000Z',
    }

    const cards: DeckStatsCard[] = [
      makeCard({
        id: 'cmd',
        scryfall_id: 'cmd-id',
        name: 'Tatyova, Benthic Druid',
        type_line: 'Legendary Creature — Merfolk Druid',
        cmc: 4,
        colors: ['G', 'U'],
        color_identity: ['G', 'U'],
        price_usd: 1,
      }),
      makeCard({
        id: 'forest',
        scryfall_id: 'forest-id',
        name: 'Forest',
        quantity: 2,
        type_line: 'Basic Land — Forest',
        produced_mana: ['G'],
        price_usd: 0.1,
      }),
      makeCard({
        id: 'bala-ged',
        scryfall_id: 'bala-ged-id',
        name: 'Bala Ged Recovery',
        type_line: 'Sorcery // Land',
        cmc: 3,
        mana_cost: '{2}{G}',
        colors: ['G'],
        color_identity: ['G'],
        price_usd: 0.2,
      }),
      makeCard({
        id: 'signet',
        scryfall_id: 'signet-id',
        name: 'Arcane Signet',
        type_line: 'Artifact',
        cmc: 2,
        tags: ['Mana Ramp'],
        price_usd: 0.5,
      }),
      makeCard({
        id: 'harmonize',
        scryfall_id: 'harmonize-id',
        name: 'Harmonize',
        type_line: 'Sorcery',
        cmc: 4,
        mana_cost: '{2}{G}{G}',
        colors: ['G'],
        color_identity: ['G'],
        tags: ['Card Draw'],
        price_usd: null,
      }),
    ]

    const report = computeDeckStatsReport(deck, cards)
    const manaCurve = buildManaCurveData(cards.filter(card => card.scryfall_id !== 'cmd-id'))

    expect(report.deck_name).toBe('Golden Deck')
    expect(report.format_normalized).toBe('edh')
    expect(report.counts).toEqual({
      total_card_quantity: 6,
      unique_entries: 5,
      mainboard_quantity: 5,
      commander_card_quantity: 1,
    })
    expect(report.price_usd).toEqual({
      sum: 1.9,
      any_missing_price: true,
      rows_missing_price: 1,
    })
    expect(report.format_validation).toMatchObject({
      validation_status: 'implemented',
      validation_implemented: true,
      data_version: expect.stringContaining('game-changers:'),
      deck_violations: [],
      violation_card_count: 0,
      violations: [],
    })
    expect(report.analytics.stats_line).toEqual({
      avg_cmc_non_land: 3,
      avg_cmc_all_cards: 1.8,
      type_counts: {
        Creature: 0,
        Planeswalker: 0,
        Battle: 0,
        Instant: 0,
        Sorcery: 2,
        Artifact: 1,
        Enchantment: 0,
        Land: 2,
      },
      lands: {
        total_display: 3,
        land_type_quantity: 2,
        basic: 2,
        non_basic: 0,
        mdfc_with_land_back: 1,
      },
      commander_on_curve: [
        {
          name: 'Tatyova, Benthic Druid',
          cmc: 4,
          probability: 1,
        },
      ],
    })
    expect(manaCurve.totalsByCmc.slice(0, 5)).toEqual([0, 0, 1, 1, 1])
    expect(manaCurve.grid.C[2].count).toBe(1)
    expect(manaCurve.grid.G[3].count).toBe(1)
    expect(manaCurve.grid.G[4].count).toBe(1)
  })

  it('excludes maybeboard and sideboard from mainboard_quantity while keeping total_card_quantity', () => {
    const deck: DeckRow = {
      id: 'deck-2',
      user_id: 'user-1',
      name: 'Zoned',
      format: 'Commander',
      description: null,
      is_public: false,
      budget_usd: null,
      bracket: null,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: [],
      primer_markdown: '',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    const cards: DeckStatsCard[] = [
      makeCard({ id: 'm1', scryfall_id: 'a', name: 'A', quantity: 1, zone: MAINBOARD_ZONE_ID }),
      makeCard({ id: 'm2', scryfall_id: 'b', name: 'B', quantity: 2, zone: MAYBEBOARD_ZONE_ID }),
      makeCard({ id: 'm3', scryfall_id: 'c', name: 'C', quantity: 3, zone: SIDEBOARD_ZONE_ID }),
    ]
    const report = computeDeckStatsReport(deck, cards)
    expect(report.counts.total_card_quantity).toBe(6)
    expect(report.counts.mainboard_quantity).toBe(1)
  })
})
