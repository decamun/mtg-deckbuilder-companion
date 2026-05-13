/**
 * Deck construction hints for the deck editor.
 *
 * Extension pattern: add a normalized format key to `FORMAT_VALIDATOR_REGISTRY`
 * with a status and optional validator. `validateDeckForFormat` is the single
 * entry point consumed by both editor UI and stats/analytics code.
 */

import {
  BRACKET_GC_LIMIT,
  GAME_CHANGER_DATA_VERSION,
  type Bracket,
  isGameChanger,
} from '@/lib/game-changers'
import {
  getZonesForFormat,
  normalizeCardZone,
  SIDEBOARD_ZONE_ID,
  zoneCountsTowardMainDeck,
} from '@/lib/zones'

const MANA = new Set(['W', 'U', 'B', 'R', 'G'])
const MIN_MAINBOARD_SIZE_BY_FORMAT: Readonly<Record<string, number>> = {
  pauper: 60,
}

/** Minimal card shape for validation (DeckCard satisfies this). */
export type FormatValidationCard = {
  id: string
  scryfall_id: string
  oracle_id: string | null
  name: string
  quantity: number
  zone: string
  type_line?: string
  oracle_text?: string
  color_identity?: string[]
  legalities?: Record<string, string>
}

export function normalizeFormatForValidation(format: string | null | undefined): string | null {
  if (format == null) return null
  const f = format.trim().toLowerCase()
  if (f === 'commander') return 'edh'
  return f || null
}

export type DeckFormatValidationStatus = 'implemented' | 'not_yet_implemented' | 'neutral'

export function isFormatValidationImplemented(format: string | null | undefined): boolean {
  return getFormatValidationStatus(format) === 'implemented'
}

/**
 * Scryfall search fragment for "fits within" color identity (shared with brew).
 * @see https://scryfall.com/docs/syntax#colors-and-color-identity
 */
export function colorIdentityScryfallClause(colors: string[]): string {
  const uniqueColors = [...new Set(colors)].join('').toLowerCase()
  return uniqueColors ? `id<=${uniqueColors}` : 'id=c'
}

export function unionColorIdentity(colorLists: (string[] | undefined)[]): Set<string> {
  const out = new Set<string>()
  for (const list of colorLists) {
    for (const c of list ?? []) {
      if (MANA.has(c)) out.add(c)
    }
  }
  return out
}

export function colorIdentityIsSubset(sub: string[] | undefined, allowed: Set<string>): boolean {
  for (const c of sub ?? []) {
    if (MANA.has(c) && !allowed.has(c)) return false
  }
  return true
}

export function isBasicLandTypeLine(typeLine: string | undefined): boolean {
  return /\bbasic\s+(?:snow\s+)?land\b/i.test(typeLine ?? '')
}

/** Matches common "any number in deck" oracle templates (heuristic). */
export function oracleTextIgnoresSingletonCap(oracleText: string | undefined): boolean {
  if (!oracleText) return false
  const o = oracleText.toLowerCase()
  return (
    o.includes('a deck can have any number of cards named') ||
    o.includes('your deck can have any number of cards named') ||
    o.includes('the deck has any number of cards named')
  )
}

function copyLimitAggregationKey(
  card: Pick<FormatValidationCard, 'id' | 'oracle_id' | 'scryfall_id'>
): string {
  return card.oracle_id || card.scryfall_id || card.id
}

export function getConstructedCopyLimitViolations(
  format: string | null | undefined,
  cards: readonly FormatValidationCard[],
  maxCopies = 4
): ReadonlyMap<string, readonly string[]> {
  const validatingZones = new Set(
    getZonesForFormat(format).filter((zone) => zone.isFormatValidated).map((zone) => zone.id)
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
    const prev = copyTotals.get(key) ?? 0
    copyTotals.set(key, prev + card.quantity)
  }

  const overCapKeys = new Set(
    [...copyTotals].filter(([, quantity]) => quantity > maxCopies).map(([key]) => key)
  )
  if (overCapKeys.size === 0) return new Map()

  const violations = new Map<string, string[]>()
  for (const card of counted) {
    const key = copyLimitAggregationKey(card)
    if (!overCapKeys.has(key)) continue
    violations.set(card.id, [`More than ${maxCopies} copies in validated deck zones`])
  }
  return violations
}

function commanderLegalityStatus(legalities: Record<string, string> | undefined): string | undefined {
  return legalities?.commander
}

function validateEdh(ctx: {
  cards: FormatValidationCard[]
  commanderScryfallIds: readonly string[]
  bracket: number | null | undefined
}): Map<string, string[]> {
  const bucket = new Map<string, Set<string>>()
  const add = (id: string, reason: string) => {
    let s = bucket.get(id)
    if (!s) {
      s = new Set()
      bucket.set(id, s)
    }
    s.add(reason)
  }

  const mainboard = ctx.cards.filter((c) => zoneCountsTowardMainDeck(c.zone))
  const commanderRows = ctx.cards.filter((c) => ctx.commanderScryfallIds.includes(c.scryfall_id))
  const canAssessColorIdentity =
    ctx.commanderScryfallIds.length > 0 &&
    commanderRows.length === ctx.commanderScryfallIds.length &&
    commanderRows.every((c) => Array.isArray(c.color_identity))
  const allowedColors = canAssessColorIdentity
    ? unionColorIdentity(commanderRows.map((c) => c.color_identity as string[]))
    : null

  for (const c of mainboard) {
    const status = commanderLegalityStatus(c.legalities)
    if (status === undefined) {
      add(c.id, 'Cannot validate Commander legality: missing data from Scryfall')
    } else if (status === 'banned') {
      add(c.id, 'Banned in Commander')
    } else if (status === 'not_legal') {
      add(c.id, 'Not legal in Commander')
    }

    if (allowedColors && c.color_identity && !colorIdentityIsSubset(c.color_identity, allowedColors)) {
      add(c.id, 'Color identity outside commanders')
    }
  }

  const oracleTotals = new Map<string, { qty: number }>()
  for (const c of mainboard) {
    if (!c.oracle_id) continue
    if (isBasicLandTypeLine(c.type_line)) continue
    if (oracleTextIgnoresSingletonCap(c.oracle_text)) continue
    const prev = oracleTotals.get(c.oracle_id)
    const qty = c.quantity
    if (prev) prev.qty += qty
    else oracleTotals.set(c.oracle_id, { qty })
  }
  for (const c of mainboard) {
    if (!c.oracle_id) continue
    if (isBasicLandTypeLine(c.type_line)) continue
    if (oracleTextIgnoresSingletonCap(c.oracle_text)) continue
    const t = oracleTotals.get(c.oracle_id)
    if (t && t.qty > 1) add(c.id, 'More than one copy (Commander singleton rule)')
  }

  const bracket = ctx.bracket
  if (bracket != null && bracket >= 1 && bracket <= 5) {
    const cap = BRACKET_GC_LIMIT[bracket as Bracket]
    if (Number.isFinite(cap)) {
      const gcRows = mainboard.filter((c) => isGameChanger(c.name))
      const totalGc = gcRows.reduce((s, c) => s + c.quantity, 0)
      if (totalGc > cap) {
        const label = cap === 1 ? 'game changer' : 'game changers'
        for (const c of gcRows) {
          add(c.id, `Bracket ${bracket}: max ${cap} ${label} (deck has ${totalGc})`)
        }
      }
    }
  }

  return new Map(Array.from(bucket, ([id, set]) => [id, [...set]]))
}

function validatePauper(ctx: DeckFormatValidationContext): Map<string, string[]> {
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
    getZonesForFormat('pauper').filter((zone) => zone.isFormatValidated).map((zone) => zone.id)
  )
  const validatedCards = ctx.cards.filter((card) =>
    validatingZones.has(normalizeCardZone(card.zone))
  )

  for (const card of validatedCards) {
    const status = card.legalities?.pauper
    if (status === undefined) {
      add(card.id, 'Cannot validate Pauper legality: missing data from Scryfall')
    } else if (status === 'banned') {
      add(card.id, 'Banned in Pauper')
    } else if (status === 'not_legal') {
      add(card.id, 'Not legal in Pauper')
    }
  }

  const copyLimitViolations = getConstructedCopyLimitViolations('pauper', ctx.cards, 4)
  for (const [cardId, reasons] of copyLimitViolations) {
    for (const reason of reasons) add(cardId, reason)
  }

  return new Map(Array.from(bucket, ([id, set]) => [id, [...set]]))
}

export type DeckFormatValidationResult = {
  status: DeckFormatValidationStatus
  violationsByCardId: ReadonlyMap<string, readonly string[]>
  deckViolations: readonly string[]
  dataVersion: string | null
}

type DeckFormatValidationContext = {
  cards: FormatValidationCard[]
  commanderScryfallIds: readonly string[]
  bracket: number | null
}

type DeckFormatValidatorDefinition = {
  label: string
  status: DeckFormatValidationStatus
  validate?: (ctx: DeckFormatValidationContext) => ReadonlyMap<string, readonly string[]>
}

function getDeckZoneViolations(
  format: string | null | undefined,
  cards: FormatValidationCard[]
): string[] {
  const violations: string[] = []
  const minMainboardSize = format ? MIN_MAINBOARD_SIZE_BY_FORMAT[format] : undefined
  if (minMainboardSize != null) {
    const mainDeckQuantity = cards
      .filter((card) => zoneCountsTowardMainDeck(card.zone))
      .reduce((sum, card) => sum + card.quantity, 0)
    if (mainDeckQuantity < minMainboardSize) {
      violations.push(
        `Mainboard must contain at least ${minMainboardSize} cards (has ${mainDeckQuantity}).`
      )
    }
  }

  const sideboardZone = getZonesForFormat(format).find(
    (zone) => zone.id === SIDEBOARD_ZONE_ID && zone.isFormatValidated
  )
  if (!sideboardZone || sideboardZone.maxCards == null) return violations

  const sideboardQuantity = cards
    .filter((card) => normalizeCardZone(card.zone) === SIDEBOARD_ZONE_ID)
    .reduce((sum, card) => sum + card.quantity, 0)

  if (sideboardQuantity > sideboardZone.maxCards) {
    violations.push(`Sideboard exceeds max ${sideboardZone.maxCards} cards (has ${sideboardQuantity}).`)
  }

  return violations
}

const FORMAT_VALIDATOR_REGISTRY: Record<string, DeckFormatValidatorDefinition> = {
  edh: { label: 'EDH / Commander', status: 'implemented', validate: validateEdh },
  standard: { label: 'Standard', status: 'not_yet_implemented' },
  modern: { label: 'Modern', status: 'not_yet_implemented' },
  pioneer: { label: 'Pioneer', status: 'not_yet_implemented' },
  legacy: { label: 'Legacy', status: 'not_yet_implemented' },
  vintage: { label: 'Vintage', status: 'not_yet_implemented' },
  pauper: { label: 'Pauper', status: 'implemented', validate: validatePauper },
  other: { label: 'Other', status: 'neutral' },
}

export function getFormatValidationStatus(format: string | null | undefined): DeckFormatValidationStatus {
  const normalized = normalizeFormatForValidation(format)
  if (!normalized) return 'neutral'
  // Unknown formats default to neutral until explicitly registered.
  return FORMAT_VALIDATOR_REGISTRY[normalized]?.status ?? 'neutral'
}

export function getFormatValidationDataVersion(format: string | null | undefined): string | null {
  const normalized = normalizeFormatForValidation(format)
  if (normalized === 'edh') {
    return `edh-live-legalities+scryfall|game-changers:${GAME_CHANGER_DATA_VERSION}`
  }
  if (normalized === 'pauper') {
    return 'pauper-live-legalities+scryfall'
  }
  return null
}

export function validateDeckForFormat(
  format: string | null | undefined,
  ctx: {
    cards: FormatValidationCard[]
    commanderScryfallIds: readonly string[]
    bracket?: number | null
    dataVersion?: string | null
  }
): DeckFormatValidationResult {
  const normalized = normalizeFormatForValidation(format)
  const definition = normalized ? FORMAT_VALIDATOR_REGISTRY[normalized] : undefined
  const status = definition?.status ?? 'neutral'
  const dataVersion = ctx.dataVersion ?? getFormatValidationDataVersion(normalized)
  const deckZoneViolations = getDeckZoneViolations(normalized, ctx.cards)

  if (status === 'implemented' && definition?.validate) {
    return {
      status,
      violationsByCardId: definition.validate({
        cards: ctx.cards,
        commanderScryfallIds: ctx.commanderScryfallIds,
        bracket: ctx.bracket ?? null,
      }),
      deckViolations: deckZoneViolations,
      dataVersion,
    }
  }

  const deckViolations =
    status === 'not_yet_implemented'
      ? [
          ...deckZoneViolations,
          `${definition?.label ?? normalized ?? 'This format'} validation is not yet implemented.`,
        ]
      : deckZoneViolations

  return {
    status,
    violationsByCardId: new Map(),
    deckViolations,
    dataVersion,
  }
}
