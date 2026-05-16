import { describe, expect, it } from 'vitest'
import {
  CANADIAN_HIGHLANDER_RULES,
  computeCanadianHighlanderViolations,
  type CanadianHighlanderRules,
} from '@/lib/canadian-highlander-rules'
import { MAINBOARD_ZONE_ID } from '@/lib/zones'

const baseCard = {
  scryfall_id: 'x',
  name: 'Test',
  quantity: 1,
  zone: MAINBOARD_ZONE_ID,
  type_line: 'Creature — Test',
}

function makeRules(over: Partial<CanadianHighlanderRules>): CanadianHighlanderRules {
  return {
    ...CANADIAN_HIGHLANDER_RULES,
    versionId: 'test-rules-v1',
    pointsCap: 10,
    pointsByOracleId: {},
    bannedOracleIds: [],
    ...over,
  }
}

describe('computeCanadianHighlanderViolations', () => {
  it('passes when under points budget with 100-card-legal basics', () => {
    const rules = makeRules({
      pointsByOracleId: { 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001': 3 },
    })
    const cards = [
      ...Array.from({ length: 99 }, (_, i) => ({
        ...baseCard,
        id: `f-${i}`,
        oracle_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      })),
      {
        ...baseCard,
        id: 'pointed',
        oracle_id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001',
      },
    ]
    const { violationsByCardId, deckViolations } = computeCanadianHighlanderViolations(cards, rules)
    expect(deckViolations).toEqual([])
    expect(violationsByCardId.size).toBe(0)
  })

  it('flags exactly at cap as legal (no deck violation)', () => {
    const rules = makeRules({
      pointsCap: 10,
      pointsByOracleId: {
        'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001': 5,
        'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002': 5,
      },
    })
    const filler = (i: number) => ({
      ...baseCard,
      id: `f-${i}`,
      oracle_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    })
    const cards = [
      ...Array.from({ length: 98 }, (_, i) => filler(i)),
      { ...baseCard, id: 'a', oracle_id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001' },
      { ...baseCard, id: 'b', oracle_id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002' },
    ]
    const { violationsByCardId, deckViolations } = computeCanadianHighlanderViolations(cards, rules)
    expect(deckViolations).toEqual([])
    expect(violationsByCardId.size).toBe(0)
  })

  it('reports deck-level and per-card messages when over points cap', () => {
    const rules = makeRules({
      pointsCap: 10,
      pointsByOracleId: {
        'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001': 6,
        'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002': 6,
      },
    })
    const filler = (i: number) => ({
      ...baseCard,
      id: `f-${i}`,
      oracle_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    })
    const cards = [
      ...Array.from({ length: 98 }, (_, i) => filler(i)),
      { ...baseCard, id: 'a', oracle_id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001' },
      { ...baseCard, id: 'b', oracle_id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002' },
    ]
    const { violationsByCardId, deckViolations } = computeCanadianHighlanderViolations(cards, rules)
    expect(deckViolations.some((m) => m.includes('12 points'))).toBe(true)
    expect(deckViolations.some((m) => m.includes('maximum 10'))).toBe(true)
    expect(violationsByCardId.get('a')?.some((r) => r.includes('Contributes 6 point'))).toBe(true)
    expect(violationsByCardId.get('b')?.some((r) => r.includes('Contributes 6 point'))).toBe(true)
  })

  it('flags banned oracle ids from the steward artifact', () => {
    const banOracle = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
    const rules = makeRules({ bannedOracleIds: [banOracle] })
    const cards = [
      ...Array.from({ length: 99 }, (_, i) => ({
        ...baseCard,
        id: `f-${i}`,
        oracle_id: `00000000-0000-4000-8000-${String(i).padStart(12, '1')}`,
      })),
      { ...baseCard, id: 'banned-row', oracle_id: banOracle },
    ]
    const { violationsByCardId, deckViolations } = computeCanadianHighlanderViolations(cards, rules)
    expect(deckViolations).toEqual([])
    expect(violationsByCardId.get('banned-row')).toContain(
      'Banned in Canadian Highlander (format steward list).',
    )
  })

  it('flags duplicate oracle across mainboard rows', () => {
    const rules = makeRules({})
    const oid = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
    const cards = [
      ...Array.from({ length: 98 }, (_, i) => ({
        ...baseCard,
        id: `f-${i}`,
        oracle_id: `00000000-0000-4000-8000-${String(i).padStart(12, '2')}`,
      })),
      { ...baseCard, id: 'd1', oracle_id: oid },
      { ...baseCard, id: 'd2', oracle_id: oid },
    ]
    const { violationsByCardId } = computeCanadianHighlanderViolations(cards, rules)
    expect(violationsByCardId.get('d1')?.[0]).toMatch(/singleton/i)
    expect(violationsByCardId.get('d2')?.[0]).toMatch(/singleton/i)
  })
})
