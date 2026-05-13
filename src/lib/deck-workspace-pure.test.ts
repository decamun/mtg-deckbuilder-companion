import { describe, expect, it } from 'vitest'
import type { DeckCard, SortingMode } from '@/lib/types'
import { DEFAULT_CARD_ZONE_ID } from '@/lib/zones'
import { TAG_GROUP_UNTAGGED } from '@/app/decks/[id]/deck-workspace-constants'
import {
  compareDeckCardsBySort,
  groupSectionHeading,
  normalizeTagForStorage,
  raritySortKey,
} from '@/app/decks/[id]/deck-workspace-pure'

function makeCard(overrides: Partial<DeckCard> & Pick<DeckCard, 'name'>): DeckCard {
  const { name, ...rest } = overrides
  return {
    ...rest,
    id: rest.id ?? name.toLowerCase().replace(/\s+/g, '-'),
    deck_id: rest.deck_id ?? 'deck-1',
    scryfall_id: rest.scryfall_id ?? `${name.toLowerCase()}-scryfall`,
    name,
    quantity: rest.quantity ?? 1,
    zone: rest.zone ?? DEFAULT_CARD_ZONE_ID,
    tags: rest.tags ?? [],
    printing_scryfall_id: rest.printing_scryfall_id ?? null,
    finish: rest.finish ?? 'nonfoil',
    oracle_id: rest.oracle_id ?? null,
  }
}

describe('compareDeckCardsBySort', () => {
  it.each<
    [SortingMode, DeckCard[], string[]]
  >([
    [
      'name',
      [makeCard({ name: 'Gamma' }), makeCard({ name: 'Alpha' }), makeCard({ name: 'Beta' })],
      ['Alpha', 'Beta', 'Gamma'],
    ],
    [
      'mana',
      [
        makeCard({ name: 'Gamma', cmc: 2, mana_cost: 'B' }),
        makeCard({ name: 'Alpha', cmc: 1, mana_cost: 'Z' }),
        makeCard({ name: 'Delta', cmc: 2, mana_cost: 'B' }),
        makeCard({ name: 'Beta', cmc: 2, mana_cost: 'A' }),
      ],
      ['Alpha', 'Beta', 'Delta', 'Gamma'],
    ],
    [
      'price',
      [
        makeCard({ name: 'Gamma', price_usd: 2 }),
        makeCard({ name: 'Beta', price_usd: null }),
        makeCard({ name: 'Delta', price_usd: 2 }),
        makeCard({ name: 'Alpha', price_usd: 1 }),
      ],
      ['Alpha', 'Delta', 'Gamma', 'Beta'],
    ],
    [
      'rarity',
      [
        makeCard({ name: 'Gamma', rarity: 'mythic' }),
        makeCard({ name: 'Beta', rarity: 'rare' }),
        makeCard({ name: 'Delta' }),
        makeCard({ name: 'Alpha', rarity: 'rare' }),
        makeCard({ name: 'Common', rarity: 'common' }),
      ],
      ['Common', 'Alpha', 'Beta', 'Gamma', 'Delta'],
    ],
  ])('sorts cards by %s', (sorting, cards, expectedOrder) => {
    const sorted = [...cards].sort((a, b) => compareDeckCardsBySort(a, b, sorting))
    expect(sorted.map((card) => card.name)).toEqual(expectedOrder)
  })
})

describe('tag and section helpers', () => {
  it.each([
    ['  card advantage  ', 'Card Advantage'],
    ['WINCON', 'Wincon'],
    ['   ', ''],
  ])('normalizes %j for storage', (raw, expected) => {
    expect(normalizeTagForStorage(raw)).toBe(expected)
  })

  it('formats tag, mana, and default group headings', () => {
    expect(groupSectionHeading(TAG_GROUP_UNTAGGED, 'tag')).toBe('Untagged')
    expect(groupSectionHeading('card advantage', 'tag')).toBe('Card Advantage')
    expect(groupSectionHeading('  mana value 7 ', 'mana')).toBe('Mana Value 7')
    expect(groupSectionHeading('Creatures', 'type')).toBe('Creatures')
  })
})

describe('raritySortKey', () => {
  it('orders known rarities before unknown values', () => {
    expect(raritySortKey('common')).toBeLessThan(raritySortKey('rare'))
    expect(raritySortKey('bonus')).toBeLessThan(raritySortKey(undefined))
    expect(raritySortKey('weird-rarity')).toBe(100)
  })
})
