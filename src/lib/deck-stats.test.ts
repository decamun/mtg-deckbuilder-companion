import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeckCardRow, DeckRow } from '@/lib/deck-service'
import { buildDeckStatsReport, hydrateDeckStatsCards } from '@/lib/deck-stats'
import { cmcOf, getCardsByIds } from '@/lib/scryfall'

vi.mock('@/lib/scryfall', () => ({
  getCardsByIds: vi.fn(),
  cmcOf: vi.fn(),
}))

describe('deck stats wrappers', () => {
  const mockedGetCardsByIds = vi.mocked(getCardsByIds)
  const mockedCmcOf = vi.mocked(cmcOf)

  beforeEach(() => {
    vi.clearAllMocks()
    mockedCmcOf.mockImplementation(card => card?.cmc ?? 0)
  })

  it('hydrates rows from the effective printing and preserves price selection inputs', async () => {
    mockedGetCardsByIds.mockResolvedValue([
      {
        id: 'cmd-id',
        oracle_id: 'cmd-oracle',
        name: 'Commander Card',
        type_line: 'Legendary Creature — Elf Druid',
        mana_cost: '{2}{G}{U}',
        oracle_text: '',
        cmc: 4,
        colors: ['G', 'U'],
        color_identity: ['G', 'U'],
        legalities: { commander: 'legal' },
        produced_mana: [],
        prices: { usd: '1.00' },
      },
      {
        id: 'base-id',
        oracle_id: 'base-oracle',
        name: 'Arcane Signet',
        type_line: 'Artifact',
        mana_cost: '{2}',
        oracle_text: '',
        cmc: 2,
        colors: [],
        color_identity: [],
        legalities: { commander: 'legal' },
        produced_mana: [],
        prices: { usd: '1.00' },
      },
      {
        id: 'printing-id',
        oracle_id: 'base-oracle',
        name: 'Arcane Signet',
        type_line: 'Artifact',
        mana_cost: '{2}',
        oracle_text: 'Add one mana of any color in your commander’s color identity.',
        cmc: 2,
        colors: [],
        color_identity: [],
        legalities: { commander: 'legal' },
        produced_mana: ['W', 'U', 'B', 'R', 'G'],
        prices: { usd: '1.50', usd_foil: '2.50' },
      },
    ])

    const rows: DeckCardRow[] = [
      {
        id: 'cmd-row',
        deck_id: 'deck-1',
        scryfall_id: 'cmd-id',
        printing_scryfall_id: null,
        oracle_id: null,
        finish: 'nonfoil',
        name: 'Commander Card',
        quantity: 1,
        zone: 'mainboard',
        tags: [],
      },
      {
        id: 'signet-row',
        deck_id: 'deck-1',
        scryfall_id: 'base-id',
        printing_scryfall_id: 'printing-id',
        oracle_id: null,
        finish: 'foil',
        name: 'Arcane Signet',
        quantity: 1,
        zone: 'mainboard',
        tags: ['mana ramp'],
      },
    ]

    const hydrated = await hydrateDeckStatsCards(rows)

    expect(mockedGetCardsByIds).toHaveBeenCalledWith(['cmd-id', 'printing-id'])
    expect(hydrated).toEqual([
      expect.objectContaining({
        id: 'cmd-row',
        scryfall_id: 'cmd-id',
        oracle_id: 'cmd-oracle',
        type_line: 'Legendary Creature — Elf Druid',
        cmc: 4,
        price_usd: 1,
      }),
      expect.objectContaining({
        id: 'signet-row',
        scryfall_id: 'base-id',
        oracle_id: 'base-oracle',
        type_line: 'Artifact',
        oracle_text: 'Add one mana of any color in your commander’s color identity.',
        produced_mana: ['W', 'U', 'B', 'R', 'G'],
        cmc: 2,
        price_usd: 2.5,
      }),
    ])
  })

  it('builds a report from hydrated rows without live Scryfall calls', async () => {
    mockedGetCardsByIds.mockResolvedValue([
      {
        id: 'cmd-id',
        oracle_id: 'cmd-oracle',
        name: 'Commander Card',
        type_line: 'Legendary Creature — Elf Druid',
        mana_cost: '{2}{G}{U}',
        oracle_text: '',
        cmc: 4,
        colors: ['G', 'U'],
        color_identity: ['G', 'U'],
        legalities: { commander: 'legal' },
        produced_mana: [],
        prices: { usd: '1.00' },
      },
      {
        id: 'signet-id',
        oracle_id: 'signet-oracle',
        name: 'Arcane Signet',
        type_line: 'Artifact',
        mana_cost: '{2}',
        oracle_text: '',
        cmc: 2,
        colors: [],
        color_identity: [],
        legalities: { commander: 'legal' },
        produced_mana: ['W', 'U', 'B', 'R', 'G'],
        prices: { usd: '1.50' },
      },
    ])

    const deck: DeckRow = {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Wrapper Deck',
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

    const rows: DeckCardRow[] = [
      {
        id: 'cmd-row',
        deck_id: 'deck-1',
        scryfall_id: 'cmd-id',
        printing_scryfall_id: null,
        oracle_id: null,
        finish: 'nonfoil',
        name: 'Commander Card',
        quantity: 1,
        zone: 'mainboard',
        tags: [],
      },
      {
        id: 'signet-row',
        deck_id: 'deck-1',
        scryfall_id: 'signet-id',
        printing_scryfall_id: null,
        oracle_id: null,
        finish: 'nonfoil',
        name: 'Arcane Signet',
        quantity: 1,
        zone: 'mainboard',
        tags: ['mana ramp'],
      },
    ]

    const report = await buildDeckStatsReport(deck, rows)

    expect(report.deck_name).toBe('Wrapper Deck')
    expect(report.counts).toEqual({
      total_card_quantity: 2,
      unique_entries: 2,
      mainboard_quantity: 1,
      commander_card_quantity: 1,
    })
    expect(report.analytics.stats_line.type_counts.Artifact).toBe(1)
    expect(report.price_usd.sum).toBe(2.5)
  })
})
