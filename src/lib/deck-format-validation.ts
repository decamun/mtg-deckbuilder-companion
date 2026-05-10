import type { ScryfallCard } from './scryfall'
import { getCardsByIds, getCardsByOracleIds } from './scryfall'
import { canPair } from './commander-pairing'

/** Minimal deck row slice needed for format checks */
export interface DeckFormatContext {
  format: string | null
}

export interface DeckCardMinimal {
  scryfall_id: string
  oracle_id: string | null
  quantity: number
  zone: string
}

/** Stable grouping key for oracle-linked deck slots */
export function deckOracleKey(row: Pick<DeckCardMinimal, 'oracle_id' | 'scryfall_id'>): string {
  return row.oracle_id ?? row.scryfall_id
}

export function deckOracleKeyFromScryfall(card: ScryfallCard): string {
  return card.oracle_id ?? card.id
}

/**
 * Maps persisted deck.format values to internal validator ids.
 * Returns null when the product should not enforce constructed rules (casual / unset).
 */
export function resolveFormatValidationKey(format: string | null | undefined): string | null {
  const raw = format?.trim().toLowerCase()
  if (!raw || raw === 'other') return null
  if (raw === 'commander' || raw === 'edh') return 'edh'
  return raw
}

export interface DeckFormatValidator {
  /** Validate commander assignment only (identity / partner rules). */
  validateCommanderSelection(commanders: ScryfallCard[]): string | null
  /**
   * Validate main deck + commander zone rows (non-sideboard), after a projected mutation.
   * `cardByKey` must contain an entry for every distinct `deckOracleKey` among those rows.
   */
  validateProjectedDeck(commanderCards: ScryfallCard[], nonSideboardCards: DeckCardMinimal[], cardByKey: Map<string, ScryfallCard>): string | null
}

const EDH_VALIDATOR: DeckFormatValidator = {
  validateCommanderSelection: validateEdhCommanderSelection,
  validateProjectedDeck: validateEdhProjectedDeck,
}

/**
 * Registry of constructed-format validators. Add new formats here (and implement rules).
 */
export const DECK_FORMAT_VALIDATORS: Readonly<Record<string, DeckFormatValidator>> = {
  edh: EDH_VALIDATOR,
}

export function getDeckFormatValidator(formatKey: string | null): DeckFormatValidator | null {
  if (!formatKey) return null
  return DECK_FORMAT_VALIDATORS[formatKey] ?? null
}

export function canServeAsCommander(card: ScryfallCard): boolean {
  const tl = card.type_line ?? ''
  const lower = tl.toLowerCase()
  if (!lower.includes('legendary')) return false
  if (lower.includes('creature')) return true
  if (lower.includes('background')) return true
  if (lower.includes('planeswalker')) {
    const ot = card.oracle_text ?? ''
    return /can be your commander/i.test(ot)
  }
  return false
}

export function validateEdhCommanderSelection(commanders: ScryfallCard[]): string | null {
  if (commanders.length === 0) return null
  if (commanders.length > 2) return 'Commander decks have at most two commanders.'
  if (commanders.length === 1) {
    return canServeAsCommander(commanders[0])
      ? null
      : `${commanders[0].name} cannot be your commander (must be a legal commander card).`
  }
  const [a, b] = commanders
  if (!canServeAsCommander(a) || !canServeAsCommander(b)) {
    return 'Both commanders must be legal commander cards.'
  }
  return canPair(a, b) ? null : 'Those commanders cannot partner together.'
}

export function combinedCommanderIdentity(commanders: ScryfallCard[]): Set<string> {
  const s = new Set<string>()
  for (const c of commanders) {
    for (const col of c.color_identity ?? []) {
      s.add(col)
    }
  }
  return s
}

export function colorIdentityAllowed(card: ScryfallCard, allowed: Set<string>): boolean {
  for (const col of card.color_identity ?? []) {
    if (!allowed.has(col)) return false
  }
  return true
}

function isBasicLand(card: ScryfallCard): boolean {
  return card.type_line?.toLowerCase().includes('basic land') ?? false
}

function allowsAnyNumberNamed(card: ScryfallCard): boolean {
  const ot = card.oracle_text ?? ''
  return /a deck can have any number of cards named/i.test(ot)
}

function isSingletonRelaxed(card: ScryfallCard): boolean {
  return isBasicLand(card) || allowsAnyNumberNamed(card)
}

function commanderLegalityMessage(name: string, legality: string | undefined): string | null {
  if (!legality || legality === 'legal') return null
  if (legality === 'banned') return `${name} is banned in Commander.`
  if (legality === 'not_legal') return `${name} is not legal in Commander.`
  return `${name} is not legal in Commander (${legality}).`
}

export function validateEdhProjectedDeck(
  commanderCards: ScryfallCard[],
  nonSideboardCards: DeckCardMinimal[],
  cardByKey: Map<string, ScryfallCard>
): string | null {
  const total = nonSideboardCards.reduce((s, c) => s + c.quantity, 0)
  if (total > 100) {
    return `Commander decks have at most 100 cards including commander(s); this deck has ${total}.`
  }

  const qtyByOracle = new Map<string, number>()
  for (const row of nonSideboardCards) {
    const key = deckOracleKey(row)
    qtyByOracle.set(key, (qtyByOracle.get(key) ?? 0) + row.quantity)
  }

  for (const [key, qty] of qtyByOracle) {
    if (qty <= 1) continue
    const card = cardByKey.get(key)
    if (!card) return 'Could not load Oracle data to validate singleton rules for this deck.'
    if (isSingletonRelaxed(card)) continue
    return `Too many copies of ${card.name} (${qty}); Commander is singleton except basic lands and cards that explicitly allow duplicates.`
  }

  const identity = combinedCommanderIdentity(commanderCards)
  const enforceIdentity = commanderCards.length > 0

  for (const [key] of qtyByOracle) {
    const card = cardByKey.get(key)
    if (!card) return 'Could not load Oracle data to validate this deck.'
    const legMsg = commanderLegalityMessage(card.name, card.legalities?.commander)
    if (legMsg) return legMsg
    if (enforceIdentity && !colorIdentityAllowed(card, identity)) {
      return `${card.name} is outside your commanders' color identity.`
    }
  }

  return null
}

/**
 * Resolve Scryfall faces for every distinct oracle/scryfall key used by non-sideboard rows,
 * merged with any freshly fetched cards (e.g. the card being added).
 */
export async function buildOracleCardMap(
  rows: DeckCardMinimal[],
  seedCards: ScryfallCard[] = []
): Promise<Map<string, ScryfallCard>> {
  const map = new Map<string, ScryfallCard>()
  for (const c of seedCards) {
    map.set(deckOracleKeyFromScryfall(c), c)
  }

  const nonSb = rows.filter((r) => r.zone !== 'sideboard')
  const oracleIds = [...new Set(nonSb.map((r) => r.oracle_id).filter(Boolean))] as string[]
  if (oracleIds.length > 0) {
    const byOracle = await getCardsByOracleIds(oracleIds)
    for (const c of byOracle) {
      const k = c.oracle_id ?? c.id
      map.set(k, c)
    }
  }

  const needIds = new Set<string>()
  for (const r of nonSb) {
    const key = deckOracleKey(r)
    if (!map.has(key) && r.scryfall_id) needIds.add(r.scryfall_id)
  }
  if (needIds.size > 0) {
    const fetched = await getCardsByIds([...needIds])
    for (const c of fetched) {
      map.set(deckOracleKeyFromScryfall(c), c)
    }
  }

  return map
}

export async function validateProjectedDeckForDeck(
  deck: DeckFormatContext,
  commanderScryfallIds: string[],
  commanderCardsInput: ScryfallCard[],
  projectedRows: DeckCardMinimal[],
  seedCards: ScryfallCard[] = []
): Promise<string | null> {
  const key = resolveFormatValidationKey(deck.format)
  const validator = getDeckFormatValidator(key)
  if (!validator) return null

  const commanderCards =
    commanderCardsInput.length > 0
      ? commanderCardsInput
      : commanderScryfallIds.length > 0
        ? await getCardsByIds(commanderScryfallIds)
        : []

  const nonSb = projectedRows.filter((c) => c.zone !== 'sideboard')
  const cardMap = await buildOracleCardMap(nonSb, [...seedCards, ...commanderCards])

  return validator.validateProjectedDeck(commanderCards, nonSb, cardMap)
}

export async function validateCommandersForDeck(
  deck: DeckFormatContext,
  commanderCards: ScryfallCard[]
): Promise<string | null> {
  const key = resolveFormatValidationKey(deck.format)
  const validator = getDeckFormatValidator(key)
  if (!validator) return null
  return validator.validateCommanderSelection(commanderCards)
}
