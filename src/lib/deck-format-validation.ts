/**
 * Deck construction hints for the deck editor.
 *
 * Extension pattern: add a normalized format key to `FORMAT_VALIDATOR_REGISTRY`
 * with a status and optional validator. `validateDeckForFormat` is the single
 * entry point consumed by both editor UI and stats/analytics code.
 */

import { BRACKET_GC_LIMIT, type Bracket, isGameChanger } from '@/lib/game-changers'

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

  const mainboard = ctx.cards.filter((c) => (c.zone ?? 'mainboard') === 'mainboard')
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
    if (status === 'banned') {
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

export type DeckFormatValidationResult = {
  status: DeckFormatValidationStatus
  violationsByCardId: ReadonlyMap<string, readonly string[]>
  deckViolations: readonly string[]
}

type DeckFormatValidationContext = {
  cards: FormatValidationCard[]
  commanderScryfallIds: readonly string[]
  bracket: number | null
}

type DeckFormatValidatorDefinition = {
  status: DeckFormatValidationStatus
  validate?: (ctx: DeckFormatValidationContext) => Map<string, string[]>
}

const FORMAT_VALIDATOR_REGISTRY: Record<string, DeckFormatValidatorDefinition> = {
  edh: { status: 'implemented', validate: validateEdh },
  standard: { status: 'not_yet_implemented' },
  modern: { status: 'not_yet_implemented' },
  pioneer: { status: 'not_yet_implemented' },
  legacy: { status: 'not_yet_implemented' },
  vintage: { status: 'not_yet_implemented' },
  pauper: { status: 'not_yet_implemented' },
  other: { status: 'neutral' },
}

const FORMAT_VALIDATION_LABELS: Record<string, string> = {
  edh: 'EDH / Commander',
  standard: 'Standard',
  modern: 'Modern',
  pioneer: 'Pioneer',
  legacy: 'Legacy',
  vintage: 'Vintage',
  pauper: 'Pauper',
  other: 'Other',
}

export function getFormatValidationStatus(format: string | null | undefined): DeckFormatValidationStatus {
  const normalized = normalizeFormatForValidation(format)
  if (!normalized) return 'neutral'
  return FORMAT_VALIDATOR_REGISTRY[normalized]?.status ?? 'neutral'
}

export function validateDeckForFormat(
  format: string | null | undefined,
  ctx: {
    cards: FormatValidationCard[]
    commanderScryfallIds: readonly string[]
    bracket?: number | null
  }
): DeckFormatValidationResult {
  const normalized = normalizeFormatForValidation(format)
  const definition = normalized ? FORMAT_VALIDATOR_REGISTRY[normalized] : undefined
  const status = definition?.status ?? 'neutral'

  if (status === 'implemented' && definition?.validate) {
    return {
      status,
      violationsByCardId: definition.validate({
        cards: ctx.cards,
        commanderScryfallIds: ctx.commanderScryfallIds,
        bracket: ctx.bracket ?? null,
      }),
      deckViolations: [],
    }
  }

  const deckViolations =
    status === 'not_yet_implemented' && normalized
      ? [`${FORMAT_VALIDATION_LABELS[normalized] ?? normalized} validation is not yet implemented.`]
      : []

  return {
    status,
    violationsByCardId: new Map(),
    deckViolations,
  }
}
