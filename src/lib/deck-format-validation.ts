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
  computeCanadianHighlanderViolations,
  getCanadianHighlanderFormatDataVersion,
} from '@/lib/canadian-highlander-rules'
import {
  getZonesForFormat,
  normalizeCardZone,
  SIDEBOARD_ZONE_ID,
  zoneCountsTowardMainDeck,
} from '@/lib/zones'

const MANA = new Set(['W', 'U', 'B', 'R', 'G'])

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
  if (f === 'canadian highlander' || f === 'canadian-highlander') return 'canlander'
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
}): ValidatedFormatViolationBundle {
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

  return asViolationBundle(new Map(Array.from(bucket, ([id, set]) => [id, [...set]])))
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
  validate?: (ctx: DeckFormatValidationContext) => ValidatedFormatViolationBundle
}

const SIXTY_CARD_CONSTRUCTED_FORMATS = new Set(['standard', 'pioneer', 'modern', 'legacy', 'pauper'])

type SixtyCardConstructedFormat = 'standard' | 'pioneer' | 'modern' | 'legacy' | 'pauper'

const CANADIAN_HIGHLANDER_FORMAT = 'canlander' as const

export type ValidatedFormatViolationBundle = {
  violationsByCardId: ReadonlyMap<string, readonly string[]>
  deckViolations?: readonly string[]
}

function asViolationBundle(
  violationsByCardId: ReadonlyMap<string, readonly string[]>
): ValidatedFormatViolationBundle {
  return { violationsByCardId }
}

function mergeViolationsInto(
  bucket: Map<string, Set<string>>,
  violations: ReadonlyMap<string, readonly string[]>
): void {
  for (const [cardId, reasons] of violations) {
    let existing = bucket.get(cardId)
    if (!existing) {
      existing = new Set()
      bucket.set(cardId, existing)
    }
    for (const reason of reasons) existing.add(reason)
  }
}

function getOrCreateCardViolationSet(
  bucket: Map<string, Set<string>>,
  cardId: string
): Set<string> {
  let reasons = bucket.get(cardId)
  if (!reasons) {
    reasons = new Set()
    bucket.set(cardId, reasons)
  }
  return reasons
}

function validateSixtyCardConstructed(
  format: SixtyCardConstructedFormat,
  cards: FormatValidationCard[]
): ValidatedFormatViolationBundle {
  const bucket = new Map<string, Set<string>>()
  const label = FORMAT_VALIDATOR_REGISTRY[format]?.label ?? format
  const validatingZones = new Set(
    getZonesForFormat(format).filter((zone) => zone.isFormatValidated).map((zone) => zone.id)
  )

  for (const card of cards) {
    if (!validatingZones.has(normalizeCardZone(card.zone))) continue
    const legalityStatus = card.legalities?.[format]
    if (legalityStatus === undefined) {
      getOrCreateCardViolationSet(bucket, card.id).add(
        `Cannot validate ${label} legality: missing data from Scryfall`
      )
      continue
    }
    if (legalityStatus === 'banned' || legalityStatus === 'not_legal') {
      getOrCreateCardViolationSet(bucket, card.id).add(
        legalityStatus === 'banned' ? `Banned in ${label}` : `Not legal in ${label}`
      )
    }
  }

  mergeViolationsInto(bucket, getConstructedCopyLimitViolations(format, cards, 4))
  return asViolationBundle(new Map(Array.from(bucket, ([id, set]) => [id, [...set]])))
}

function getDeckZoneViolations(
  format: string | null | undefined,
  cards: FormatValidationCard[]
): string[] {
  const violations: string[] = []
  if (format && SIXTY_CARD_CONSTRUCTED_FORMATS.has(format)) {
    const mainboardQuantity = cards
      .filter((card) => zoneCountsTowardMainDeck(card.zone))
      .reduce((sum, card) => sum + card.quantity, 0)
    if (mainboardQuantity !== 60) {
      violations.push(`Mainboard must contain exactly 60 cards (has ${mainboardQuantity}).`)
    }
  }

  if (format === CANADIAN_HIGHLANDER_FORMAT) {
    const mainboardQuantity = cards
      .filter((card) => zoneCountsTowardMainDeck(card.zone))
      .reduce((sum, card) => sum + card.quantity, 0)
    if (mainboardQuantity !== 100) {
      violations.push(`Mainboard must contain exactly 100 cards (has ${mainboardQuantity}).`)
    }
  }

  const sideboardZone = getZonesForFormat(format).find(
    (zone) => zone.id === SIDEBOARD_ZONE_ID && zone.isFormatValidated
  )
  if (!sideboardZone || sideboardZone.maxCards == null) return violations

  const sideboardQuantity = cards
    .filter((card) => normalizeCardZone(card.zone) === SIDEBOARD_ZONE_ID)
    .reduce((sum, card) => sum + card.quantity, 0)

  if (sideboardQuantity <= sideboardZone.maxCards) return violations
  return [...violations, `Sideboard exceeds max ${sideboardZone.maxCards} cards (has ${sideboardQuantity}).`]
}

const FORMAT_VALIDATOR_REGISTRY: Record<string, DeckFormatValidatorDefinition> = {
  edh: { label: 'EDH / Commander', status: 'implemented', validate: validateEdh },
  standard: {
    label: 'Standard',
    status: 'implemented',
    validate: ({ cards }) => validateSixtyCardConstructed('standard', cards),
  },
  modern: {
    label: 'Modern',
    status: 'implemented',
    validate: ({ cards }) => validateSixtyCardConstructed('modern', cards),
  },
  pioneer: {
    label: 'Pioneer',
    status: 'implemented',
    validate: ({ cards }) => validateSixtyCardConstructed('pioneer', cards),
  },
  canlander: {
    label: 'Canadian Highlander',
    status: 'implemented',
    validate: ({ cards }) => computeCanadianHighlanderViolations(cards),
  },
  legacy: {
    label: 'Legacy',
    status: 'implemented',
    validate: ({ cards }) => validateSixtyCardConstructed('legacy', cards),
  },
  vintage: { label: 'Vintage', status: 'not_yet_implemented' },
  pauper: {
    label: 'Pauper',
    status: 'implemented',
    validate: ({ cards }) => validateSixtyCardConstructed('pauper', cards),
  },
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
  if (normalized && SIXTY_CARD_CONSTRUCTED_FORMATS.has(normalized)) {
    return `${normalized}-live-legalities+scryfall`
  }
  if (normalized === CANADIAN_HIGHLANDER_FORMAT) {
    return getCanadianHighlanderFormatDataVersion()
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
    const validated = definition.validate({
      cards: ctx.cards,
      commanderScryfallIds: ctx.commanderScryfallIds,
      bracket: ctx.bracket ?? null,
    })
    const extraDeck = validated.deckViolations ?? []
    return {
      status,
      violationsByCardId: validated.violationsByCardId,
      deckViolations: [...deckZoneViolations, ...extraDeck],
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
