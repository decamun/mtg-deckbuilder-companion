import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeckCard } from '@/lib/types'
import { parseDecklist, parseDecklistLine, resolveDecklist } from '@/lib/decklist-import'
import { getCardBySetAndCN, getCardsCollection } from '@/lib/scryfall'

vi.mock('@/lib/scryfall', () => ({
  getCardsCollection: vi.fn(),
  getCardBySetAndCN: vi.fn(),
}))

describe('parseDecklistLine', () => {
  it('parses quantity, set, collector number, and foil flag', () => {
    expect(parseDecklistLine('4 Lightning Bolt (M11) 146 *F*')).toEqual({
      quantity: 4,
      name: 'Lightning Bolt',
      setCode: 'M11',
      collectorNumber: '146',
      foil: true,
      zone: 'mainboard',
    })
  })

  it('ignores comments and empty lines', () => {
    expect(parseDecklistLine('')).toBeNull()
    expect(parseDecklistLine('// comment')).toBeNull()
    expect(parseDecklist('1 Sol Ring\n# note\n\n1 Arcane Signet')).toHaveLength(2)
  })

  it('detects sideboard and maybeboard section markers', () => {
    const result = parseDecklist(
      '1 Sol Ring\n// Sideboard\n1 Tormod\'s Crypt\n// Maybeboard\n1 Opt'
    )
    expect(result).toHaveLength(3)
    expect(result[0]?.zone).toBe('mainboard')
    expect(result[1]?.zone).toBe('sideboard')
    expect(result[2]?.zone).toBe('maybeboard')
  })

  it('detects SB: inline sideboard prefix', () => {
    const result = parseDecklist('SB: 2 Tormod\'s Crypt')
    expect(result).toHaveLength(1)
    expect(result[0]?.zone).toBe('sideboard')
  })
})

describe('resolveDecklist', () => {
  const mockedGetCardsCollection = vi.mocked(getCardsCollection)
  const mockedGetCardBySetAndCN = vi.mocked(getCardBySetAndCN)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses split-card primary face lookup and warns on unavailable foil or missing cards', async () => {
    mockedGetCardsCollection.mockResolvedValue([
      {
        id: 'wear-tear-id',
        oracle_id: 'wear-tear-oracle',
        name: 'Wear // Tear',
        type_line: 'Instant',
        mana_cost: '',
        oracle_text: '',
      },
    ])
    mockedGetCardBySetAndCN.mockResolvedValue({
      id: 'wear-tear-printing',
      set: 'lea',
      set_name: 'Limited Edition Alpha',
      collector_number: '123',
      released_at: '1993-08-05',
      name: 'Wear // Tear',
      type_line: 'Instant',
      mana_cost: '',
      oracle_text: '',
      finishes: ['nonfoil'],
    })

    const result = await resolveDecklist('1 Wear // Tear (LEA) 123 F\n1 Missing Card')

    expect(mockedGetCardsCollection).toHaveBeenCalledWith(
      expect.arrayContaining(['Wear', 'Missing Card']),
    )
    expect(result.cards).toEqual([
      {
        name: 'Wear // Tear',
        quantity: 1,
        scryfall_id: 'wear-tear-id',
        oracle_id: 'wear-tear-oracle',
        printing_scryfall_id: 'wear-tear-printing',
        finish: 'nonfoil',
        zone: 'mainboard',
      },
    ])
    expect(result.warnings).toContain(
      'Wear // Tear: foil not available for this printing — saved as non-foil',
    )
    expect(result.warnings).toContain('Could not find card: Missing Card')
  })

  it('preserves existing printing and finish when requested', async () => {
    mockedGetCardsCollection.mockResolvedValue([
      {
        id: 'sol-ring-scryfall',
        oracle_id: 'sol-ring-oracle',
        name: 'Sol Ring',
        type_line: 'Artifact',
        mana_cost: '{1}',
        oracle_text: '',
      },
    ])
    mockedGetCardBySetAndCN.mockResolvedValue(null)

    const existing: DeckCard[] = [
      {
        id: 'deck-card-1',
        deck_id: 'deck-1',
        scryfall_id: 'sol-ring-scryfall',
        name: 'Sol Ring',
        quantity: 1,
        zone: 'mainboard',
        tags: [],
        printing_scryfall_id: 'existing-printing',
        finish: 'foil',
        oracle_id: 'sol-ring-oracle',
      },
    ]

    const result = await resolveDecklist('1 Sol Ring', {
      preservePrintings: true,
      existingCards: existing,
    })

    expect(result.cards[0]?.printing_scryfall_id).toBe('existing-printing')
    expect(result.cards[0]?.finish).toBe('foil')
  })
})
