import { describe, expect, it } from 'vitest'
import type { ScryfallCard } from '@/lib/scryfall'
import type { BrewDeckRow, BrewPickState } from '@/lib/brew-planner'
import { priceOf, takeRowsForSlots } from '@/lib/brew-planner'

function card(name: string, usd?: string | null): ScryfallCard {
  return {
    id: `${name}-id`,
    name,
    type_line: 'Creature',
    mana_cost: '',
    oracle_text: '',
    prices: { usd },
  }
}

function row(name: string, quantity: number, usd?: string | null): BrewDeckRow {
  return {
    deck_id: 'deck-1',
    scryfall_id: `${name}-scryfall`,
    name,
    quantity,
    _card: card(name, usd),
  }
}

function state(overrides?: Partial<BrewPickState>): BrewPickState {
  return {
    gameChangerCount: 0,
    totalCost: 0,
    ...overrides,
  }
}

describe('priceOf', () => {
  it('returns 0 for missing cards or missing usd prices', () => {
    expect(priceOf(undefined)).toBe(0)
    expect(priceOf(null)).toBe(0)
    expect(priceOf(card('No Price'))).toBe(0)
    expect(priceOf(card('Null Price', null))).toBe(0)
  })

  it('returns 0 for invalid usd strings and parses valid usd strings', () => {
    expect(priceOf(card('Invalid Price', 'not-a-number'))).toBe(0)
    expect(priceOf(card('Valid Price', '2.75'))).toBe(2.75)
  })
})

describe('takeRowsForSlots', () => {
  const opts = {
    gameChangerLimit: 1,
    isGameChanger: (name: string) => name.startsWith('GC '),
  }

  it('keeps source ordering when budget is null', () => {
    const result = takeRowsForSlots(
      [row('Expensive First', 1, '9'), row('Cheap Second', 1, '1')],
      1,
      state(),
      { ...opts, budgetUsd: null },
    )

    expect(result.taken.map((r) => r.name)).toEqual(['Expensive First'])
    expect(result.remaining.map((r) => r.name)).toEqual(['Cheap Second'])
  })

  it('uses cheapest-first ordering when budget constrained', () => {
    const pickState = state()
    const result = takeRowsForSlots(
      [row('Expensive First', 1, '9'), row('Cheap Second', 1, '1')],
      2,
      pickState,
      { ...opts, budgetUsd: 1 },
    )

    expect(result.taken.map((r) => r.name)).toEqual(['Cheap Second'])
    expect(result.remaining.map((r) => r.name)).toEqual(['Expensive First'])
    expect(pickState.totalCost).toBe(1)
  })

  it('respects game changer limit', () => {
    const pickState = state({ gameChangerCount: 1 })
    const result = takeRowsForSlots(
      [row('GC Big Swing', 1, '2'), row('Regular Card', 1, '2')],
      2,
      pickState,
      { ...opts, budgetUsd: null },
    )

    expect(result.taken.map((r) => r.name)).toEqual(['Regular Card'])
    expect(result.remaining.map((r) => r.name)).toEqual(['GC Big Swing'])
    expect(pickState.gameChangerCount).toBe(1)
  })

  it('applies budgetReserve when calculating affordability', () => {
    const pickState = state({ totalCost: 7 })
    const result = takeRowsForSlots(
      [row('Two Dollar', 1, '2'), row('One Dollar', 1, '1')],
      2,
      pickState,
      { ...opts, budgetUsd: 10, budgetReserve: 2 },
    )

    expect(result.taken.map((r) => r.name)).toEqual(['One Dollar'])
    expect(result.remaining.map((r) => r.name)).toEqual(['Two Dollar'])
    expect(pickState.totalCost).toBe(8)
  })

  it('caps by slot count and returns remaining quantity when partially taken', () => {
    const result = takeRowsForSlots(
      [row('Stacked Row', 5, '1')],
      2,
      state(),
      { ...opts, budgetUsd: null },
    )

    expect(result.taken).toEqual([
      expect.objectContaining({ name: 'Stacked Row', quantity: 2 }),
    ])
    expect(result.remaining).toEqual([
      expect.objectContaining({ name: 'Stacked Row', quantity: 3 }),
    ])
  })

  it('returns remaining rows when budget causes partial take', () => {
    const pickState = state()
    const result = takeRowsForSlots(
      [row('Budget-Limited Row', 4, '3')],
      4,
      pickState,
      { ...opts, budgetUsd: 5 },
    )

    expect(result.taken).toEqual([
      expect.objectContaining({ name: 'Budget-Limited Row', quantity: 1 }),
    ])
    expect(result.remaining).toEqual([
      expect.objectContaining({ name: 'Budget-Limited Row', quantity: 3 }),
    ])
    expect(pickState.totalCost).toBe(3)
  })
})
