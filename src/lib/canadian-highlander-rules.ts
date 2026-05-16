/**
 * Canadian Highlander (Canlander) — points list and format-specific ban oracle ids.
 * @see https://canadianhighlander.ca/about/
 */

import CANADIAN_HIGHLANDER_RULES_JSON from '@/data/canadian-highlander-rules.json'
import {
  getZonesForFormat,
  normalizeCardZone,
  zoneCountsTowardMainDeck,
} from '@/lib/zones'

export type CanadianHighlanderRules = {
  versionId: string
  pointsCap: number
  sourceNote: string
  pointsByOracleId: Record<string, number>
  bannedOracleIds: readonly string[]
}

export const CANADIAN_HIGHLANDER_RULES = CANADIAN_HIGHLANDER_RULES_JSON as CanadianHighlanderRules

/** Minimal card shape (matches {@link FormatValidationCard} in deck-format-validation). */
export type CanadianHighlanderValidationCard = {
  id: string
  scryfall_id: string
  oracle_id: string | null
  name: string
  quantity: number
  zone: string
  type_line?: string
  oracle_text?: string
}

export function getCanadianHighlanderArtifactVersion(rules: CanadianHighlanderRules = CANADIAN_HIGHLANDER_RULES): string {
  return rules.versionId
}

export function getCanadianHighlanderFormatDataVersion(
  rules: CanadianHighlanderRules = CANADIAN_HIGHLANDER_RULES
): string {
  return `canlander-artifacts:${rules.versionId}|points-cap=${rules.pointsCap}`
}

type ValidatorMap = ReadonlyMap<string, readonly string[]>

function copyLimitAggregationKey(card: Pick<CanadianHighlanderValidationCard, 'id' | 'oracle_id' | 'scryfall_id'>): string {
  return card.oracle_id || card.scryfall_id || card.id
}

function isBasicLandTypeLine(typeLine: string | undefined): boolean {
  return /\bbasic\s+(?:snow\s+)?land\b/i.test(typeLine ?? '')
}

function oracleTextIgnoresSingletonCap(oracleText: string | undefined): boolean {
  if (!oracleText) return false
  const o = oracleText.toLowerCase()
  return (
    o.includes('a deck can have any number of cards named') ||
    o.includes('your deck can have any number of cards named') ||
    o.includes('the deck has any number of cards named')
  )
}

function getSingletonViolations(cards: readonly CanadianHighlanderValidationCard[]): ValidatorMap {
  const validatingZones = new Set(
    getZonesForFormat('canlander').filter((z) => z.isFormatValidated).map((z) => z.id)
  )
  const counted = cards.filter(
    (card) =>
      validatingZones.has(normalizeCardZone(card.zone)) &&
      !isBasicLandTypeLine(card.type_line) &&
      !oracleTextIgnoresSingletonCap(card.oracle_text)
  )
  const copyTotals = new Map<string, number>()
  for (const card of counted) {
    const key = copyLimitAggregationKey(card)
    copyTotals.set(key, (copyTotals.get(key) ?? 0) + card.quantity)
  }
  const overCapKeys = new Set(
    [...copyTotals].filter(([, quantity]) => quantity > 1).map(([key]) => key)
  )
  if (overCapKeys.size === 0) return new Map()
  const violations = new Map<string, string[]>()
  for (const card of counted) {
    const key = copyLimitAggregationKey(card)
    if (!overCapKeys.has(key)) continue
    violations.set(card.id, ['More than 1 copy in validated deck zones (Canadian Highlander singleton rule)'])
  }
  return violations
}

/**
 * Singleton + points + artifact ban list. Deck size (100) is enforced separately via
 * {@link getDeckZoneViolations} for the `canlander` format key.
 */
export function computeCanadianHighlanderViolations(
  cards: readonly CanadianHighlanderValidationCard[],
  rules: CanadianHighlanderRules = CANADIAN_HIGHLANDER_RULES
): { violationsByCardId: ValidatorMap; deckViolations: readonly string[] } {
  const bucket = new Map<string, Set<string>>()
  const add = (id: string, reason: string) => {
    let s = bucket.get(id)
    if (!s) {
      s = new Set()
      bucket.set(id, s)
    }
    s.add(reason)
  }

  const validatingZones = new Set(
    getZonesForFormat('canlander').filter((z) => z.isFormatValidated).map((z) => z.id)
  )
  const counted = cards.filter(
    (c) => validatingZones.has(normalizeCardZone(c.zone)) && zoneCountsTowardMainDeck(c.zone)
  )

  const banned = new Set(rules.bannedOracleIds)
  for (const c of counted) {
    const oid = c.oracle_id
    if (oid && banned.has(oid)) {
      add(c.id, 'Banned in Canadian Highlander (format steward list).')
    }
  }

  for (const [id, reasons] of getSingletonViolations(cards)) {
    for (const r of reasons) add(id, r)
  }

  let totalPoints = 0
  const cardPointRows: { id: string; points: number }[] = []
  for (const c of counted) {
    const oid = c.oracle_id
    if (!oid) continue
    const p = rules.pointsByOracleId[oid]
    if (p == null || p <= 0) continue
    const contrib = p * c.quantity
    totalPoints += contrib
    cardPointRows.push({ id: c.id, points: contrib })
  }

  const deckViolations: string[] = []
  if (totalPoints > rules.pointsCap) {
    deckViolations.push(
      `Canadian Highlander: deck uses ${totalPoints} points (maximum ${rules.pointsCap}).`
    )
    for (const row of cardPointRows) {
      if (row.points <= 0) continue
      add(
        row.id,
        `Contributes ${row.points} point(s) toward the ${rules.pointsCap}-point budget (deck total ${totalPoints}).`
      )
    }
  }

  return {
    violationsByCardId: new Map(Array.from(bucket, ([id, set]) => [id, [...set]])),
    deckViolations,
  }
}
