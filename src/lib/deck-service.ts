import type { SupabaseClient } from '@supabase/supabase-js'
import { getCard, type ScryfallCard } from './scryfall'
import {
  validateProjectedDeckForDeck,
  validateCommandersForDeck,
  type DeckCardMinimal,
} from './deck-format-validation'

/**
 * Deck mutation service.
 *
 * Every function takes (supabase, userId, ...). Callers may pass a
 * session-scoped client (RLS active) or the service-role client (RLS bypassed).
 * Either way, every query filters by user_id explicitly so service-role usage
 * stays correct.
 *
 * Returned errors are plain Error objects with human-readable messages.
 */

export type Finish = 'nonfoil' | 'foil' | 'etched'

export interface DeckRow {
  id: string
  user_id: string
  name: string
  format: string | null
  description: string | null
  is_public: boolean
  budget_usd: number | null
  bracket: number | null
  cover_image_scryfall_id: string | null
  commander_scryfall_ids: string[]
  primer_markdown: string
  created_at: string
  updated_at?: string
}

export interface DeckCardRow {
  id: string
  deck_id: string
  scryfall_id: string
  printing_scryfall_id: string | null
  oracle_id: string | null
  finish: Finish
  name: string
  quantity: number
  zone: string
  tags: string[]
}

class DeckServiceError extends Error {
  code: 'not_found' | 'forbidden' | 'invalid' | 'db_error'

  constructor(message: string, code: 'not_found' | 'forbidden' | 'invalid' | 'db_error') {
    super(message)
    this.name = 'DeckServiceError'
    this.code = code
  }
}

async function loadOwnedDeck(
  supabase: SupabaseClient,
  userId: string,
  deckId: string
): Promise<DeckRow> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  if (!data) throw new DeckServiceError('Deck not found or not owned by user', 'forbidden')
  return data as DeckRow
}

async function loadOwnedDeckCard(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string
): Promise<{ card: DeckCardRow; deck: DeckRow }> {
  const { data: card, error } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('id', deckCardId)
    .maybeSingle()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  if (!card) throw new DeckServiceError('Deck card not found', 'not_found')
  const deck = await loadOwnedDeck(supabase, userId, card.deck_id)
  return { card: card as DeckCardRow, deck }
}

async function loadDeckCards(supabase: SupabaseClient, deckId: string): Promise<DeckCardRow[]> {
  const { data, error } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId)
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return (data ?? []) as DeckCardRow[]
}

function deckCardRowToMinimal(row: DeckCardRow): DeckCardMinimal {
  return {
    scryfall_id: row.scryfall_id,
    oracle_id: row.oracle_id,
    quantity: row.quantity,
    zone: row.zone ?? 'mainboard',
  }
}

async function enforceProjectedDeckFormat(
  deck: DeckRow,
  commanderCards: ScryfallCard[],
  projected: DeckCardMinimal[],
  seedCards: ScryfallCard[] = []
): Promise<void> {
  const msg = await validateProjectedDeckForDeck(
    deck,
    deck.commander_scryfall_ids ?? [],
    commanderCards,
    projected,
    seedCards
  )
  if (msg) throw new DeckServiceError(msg, 'invalid')
}

async function getLatestVersionId(
  supabase: SupabaseClient,
  deckId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('deck_versions')
    .select('id')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function hasVersionSince(
  supabase: SupabaseClient,
  deckId: string,
  sinceIso: string
): Promise<boolean> {
  const { data } = await supabase
    .from('deck_versions')
    .select('id')
    .eq('deck_id', deckId)
    .gte('created_at', sinceIso)
    .limit(1)
    .maybeSingle()
  return !!data?.id
}

async function recordDeckVersion(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  summary: string,
  sinceIso: string
): Promise<void> {
  if (await hasVersionSince(supabase, deckId, sinceIso)) return

  const deck = await loadOwnedDeck(supabase, userId, deckId)
  const { data: cards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('scryfall_id, printing_scryfall_id, finish, oracle_id, name, quantity, zone, tags')
    .eq('deck_id', deckId)
  if (cardsErr) return

  const snapshot = {
    version: 1,
    deck: {
      name: deck.name,
      description: deck.description ?? null,
      format: deck.format ?? null,
      budget_usd: deck.budget_usd ?? null,
      bracket: deck.bracket ?? null,
      commanders: deck.commander_scryfall_ids ?? [],
      cover_image_scryfall_id: deck.cover_image_scryfall_id ?? null,
      is_public: !!deck.is_public,
    },
    cards: (cards ?? []).map((c) => ({
      scryfall_id: c.scryfall_id,
      printing_scryfall_id: c.printing_scryfall_id ?? null,
      finish: c.finish ?? 'nonfoil',
      oracle_id: c.oracle_id ?? null,
      name: c.name,
      quantity: c.quantity,
      zone: c.zone ?? 'mainboard',
      tags: c.tags ?? [],
    })),
    primer_markdown: deck.primer_markdown ?? '',
  }

  const { error } = await supabase.from('deck_versions').insert({
    deck_id: deckId,
    parent_id: await getLatestVersionId(supabase, deckId),
    name: null,
    is_bookmarked: false,
    change_summary: summary,
    snapshot,
    created_by: userId,
  })
  if (error) console.warn('Failed to record deck version:', error.message)
}

export async function listDecks(
  supabase: SupabaseClient,
  userId: string
): Promise<DeckRow[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return (data ?? []) as DeckRow[]
}

export async function getDeck(
  supabase: SupabaseClient,
  userId: string,
  deckId: string
): Promise<DeckRow> {
  return loadOwnedDeck(supabase, userId, deckId)
}

export async function getDecklist(
  supabase: SupabaseClient,
  userId: string,
  deckId: string
): Promise<DeckCardRow[]> {
  await loadOwnedDeck(supabase, userId, deckId)
  const { data, error } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return (data ?? []) as DeckCardRow[]
}

export interface AddCardInput {
  scryfall_id: string
  oracle_id?: string | null
  printing_scryfall_id?: string | null
  name: string
  quantity?: number
  finish?: Finish
}

async function resolveScryfallCard(id: string | null | undefined, field: string): Promise<ScryfallCard> {
  const trimmed = id?.trim()
  if (!trimmed) throw new DeckServiceError(`${field} is required`, 'invalid')

  const card = await getCard(trimmed)
  if (!card?.id || !card.name || !card.type_line) {
    throw new DeckServiceError(`${field} ${trimmed} was not found on Scryfall`, 'invalid')
  }
  return card
}

function assertSameOracle(base: ScryfallCard, printing: ScryfallCard): void {
  if (base.oracle_id && printing.oracle_id && base.oracle_id !== printing.oracle_id) {
    throw new DeckServiceError(
      `printing_scryfall_id ${printing.id} is not a printing of ${base.name}`,
      'invalid'
    )
  }
}

async function resolveOptionalScryfallCard(id: string | null | undefined, field: string): Promise<ScryfallCard | null> {
  if (id === null || id === undefined) return null
  return resolveScryfallCard(id, field)
}

export async function addCard(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  input: AddCardInput
): Promise<DeckCardRow> {
  const deck = await loadOwnedDeck(supabase, userId, deckId)
  const quantity = input.quantity ?? 1
  if (quantity < 1) throw new DeckServiceError('quantity must be >= 1', 'invalid')
  const versionSince = new Date().toISOString()
  const scryfallCard = await resolveScryfallCard(input.scryfall_id, 'scryfall_id')
  const printingCard = input.printing_scryfall_id
    ? await resolveScryfallCard(input.printing_scryfall_id, 'printing_scryfall_id')
    : null
  if (printingCard) assertSameOracle(scryfallCard, printingCard)

  const allRows = await loadDeckCards(supabase, deckId)
  const existing = allRows.find((r) => r.scryfall_id === scryfallCard.id)

  let projected: DeckCardMinimal[]
  if (existing) {
    projected = allRows.map((r) =>
      r.id === existing.id
        ? {
            scryfall_id: r.scryfall_id,
            oracle_id: r.oracle_id ?? scryfallCard.oracle_id ?? null,
            quantity: r.quantity + quantity,
            zone: r.zone ?? 'mainboard',
          }
        : deckCardRowToMinimal(r)
    )
  } else {
    projected = [
      ...allRows.map(deckCardRowToMinimal),
      {
        scryfall_id: scryfallCard.id,
        oracle_id: scryfallCard.oracle_id ?? input.oracle_id ?? null,
        quantity,
        zone: 'mainboard',
      },
    ]
  }

  await enforceProjectedDeckFormat(deck, [], projected, [scryfallCard])

  if (existing) {
    const { data, error } = await supabase
      .from('deck_cards')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw new DeckServiceError(error.message, 'db_error')
    await recordDeckVersion(
      supabase,
      userId,
      deckId,
      `Increased ${existing.name} to ${existing.quantity + quantity}`,
      versionSince
    )
    return data as DeckCardRow
  }

  const { data, error } = await supabase
    .from('deck_cards')
    .insert({
      deck_id: deckId,
      scryfall_id: scryfallCard.id,
      oracle_id: scryfallCard.oracle_id ?? input.oracle_id ?? null,
      printing_scryfall_id: printingCard?.id ?? null,
      finish: input.finish ?? 'nonfoil',
      name: scryfallCard.name,
      quantity,
    })
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, deckId, `Added ${scryfallCard.name}`, versionSince)
  return data as DeckCardRow
}

export async function removeCard(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string
): Promise<void> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  const versionSince = new Date().toISOString()
  const { error } = await supabase.from('deck_cards').delete().eq('id', deckCardId)
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, card.deck_id, `Removed ${card.name}`, versionSince)
}

export async function setCardQuantity(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  quantity: number
): Promise<DeckCardRow | null> {
  const { card, deck } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  if (quantity < 0) throw new DeckServiceError('quantity must be >= 0', 'invalid')
  const versionSince = new Date().toISOString()

  const allRows = await loadDeckCards(supabase, card.deck_id)
  let projected: DeckCardMinimal[]
  if (quantity === 0) {
    projected = allRows.filter((r) => r.id !== deckCardId).map(deckCardRowToMinimal)
  } else {
    projected = allRows.map((r) =>
      r.id === deckCardId ? { ...deckCardRowToMinimal(r), quantity } : deckCardRowToMinimal(r)
    )
  }

  await enforceProjectedDeckFormat(deck, [], projected, [])

  if (quantity === 0) {
    const { error } = await supabase.from('deck_cards').delete().eq('id', deckCardId)
    if (error) throw new DeckServiceError(error.message, 'db_error')
    await recordDeckVersion(supabase, userId, card.deck_id, `Removed ${card.name}`, versionSince)
    return null
  }
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ quantity })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, card.deck_id, `Changed ${card.name} quantity to ${quantity}`, versionSince)
  return data as DeckCardRow
}

export async function setCardTags(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  tags: string[]
): Promise<DeckCardRow> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  const cleanTags = Array.from(
    new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))
  )
  const versionSince = new Date().toISOString()
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ tags: cleanTags })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, card.deck_id, `Updated tags for ${card.name}`, versionSince)
  return data as DeckCardRow
}

export async function addCardTag(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  tag: string
): Promise<DeckCardRow> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  const trimmed = tag.trim()
  if (!trimmed) throw new DeckServiceError('tag must be non-empty', 'invalid')
  if ((card.tags ?? []).includes(trimmed)) return card
  return setCardTags(supabase, userId, deckCardId, [...(card.tags ?? []), trimmed])
}

export async function removeCardTag(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  tag: string
): Promise<DeckCardRow> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  return setCardTags(
    supabase,
    userId,
    deckCardId,
    (card.tags ?? []).filter((t) => t !== tag)
  )
}

export async function setCardPrinting(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  printingScryfallId: string | null
): Promise<DeckCardRow> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  const printingCard = await resolveOptionalScryfallCard(printingScryfallId, 'printing_scryfall_id')
  if (printingCard) {
    const baseCard = await resolveScryfallCard(card.scryfall_id, 'scryfall_id')
    assertSameOracle(baseCard, printingCard)
  }
  const versionSince = new Date().toISOString()
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ printing_scryfall_id: printingCard?.id ?? null })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(
    supabase,
    userId,
    card.deck_id,
    printingCard ? `Changed ${card.name} printing` : `Reset ${card.name} to default printing`,
    versionSince
  )
  return data as DeckCardRow
}

export async function setCardFinish(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  finish: Finish
): Promise<DeckCardRow> {
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  const versionSince = new Date().toISOString()
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ finish })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, card.deck_id, `Changed ${card.name} finish to ${finish}`, versionSince)
  return data as DeckCardRow
}

export async function setCommanders(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  scryfallIds: string[]
): Promise<DeckRow> {
  const deck = await loadOwnedDeck(supabase, userId, deckId)
  if (scryfallIds.length > 2) {
    throw new DeckServiceError('A deck can have at most 2 commanders', 'invalid')
  }
  const uniqueCommanderIds = Array.from(new Set(scryfallIds))
  const commanderCards = await Promise.all(
    uniqueCommanderIds.map((id) => resolveScryfallCard(id, 'commander_scryfall_ids'))
  )
  const dedup = Array.from(new Set(commanderCards.map((card) => card.id)))
  const versionSince = new Date().toISOString()

  const cmdErr = await validateCommandersForDeck(deck, commanderCards)
  if (cmdErr) throw new DeckServiceError(cmdErr, 'invalid')

  const deckRows = await loadDeckCards(supabase, deckId)
  const projected = deckRows.map(deckCardRowToMinimal)
  await enforceProjectedDeckFormat(deck, commanderCards, projected, [])

  const { data, error } = await supabase
    .from('decks')
    .update({ commander_scryfall_ids: dedup })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, deckId, 'Updated commanders', versionSince)
  return data as DeckRow
}

export async function setCoverImage(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  scryfallId: string | null
): Promise<DeckRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  const coverCard = await resolveOptionalScryfallCard(scryfallId, 'cover_image_scryfall_id')
  const versionSince = new Date().toISOString()
  const { data, error } = await supabase
    .from('decks')
    .update({ cover_image_scryfall_id: coverCard?.id ?? null })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(
    supabase,
    userId,
    deckId,
    coverCard ? 'Updated cover image' : 'Removed cover image',
    versionSince
  )
  return data as DeckRow
}

export async function setPrimer(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  markdown: string
): Promise<DeckRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  const versionSince = new Date().toISOString()
  const { data, error } = await supabase
    .from('decks')
    .update({ primer_markdown: markdown })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  await recordDeckVersion(supabase, userId, deckId, 'Updated primer', versionSince)
  return data as DeckRow
}

export async function patchPrimer(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  oldString: string,
  newString: string
): Promise<DeckRow> {
  const deck = await loadOwnedDeck(supabase, userId, deckId)
  const current = deck.primer_markdown ?? ''
  const count = current.split(oldString).length - 1
  if (count === 0) throw new DeckServiceError('old_string not found in primer', 'invalid')
  if (count > 1)
    throw new DeckServiceError(
      `old_string matches ${count} locations — provide more surrounding context to make it unique`,
      'invalid'
    )
  const updated = current.replace(oldString, newString)
  return setPrimer(supabase, userId, deckId, updated)
}

export { DeckServiceError }
