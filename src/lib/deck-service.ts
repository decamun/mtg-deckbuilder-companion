import type { SupabaseClient } from '@supabase/supabase-js'

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
  constructor(message: string, public code: 'not_found' | 'forbidden' | 'invalid' | 'db_error') {
    super(message)
    this.name = 'DeckServiceError'
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

export async function addCard(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  input: AddCardInput
): Promise<DeckCardRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  const quantity = input.quantity ?? 1
  if (quantity < 1) throw new DeckServiceError('quantity must be >= 1', 'invalid')

  const { data: existing, error: existingErr } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
    .eq('scryfall_id', input.scryfall_id)
    .maybeSingle()
  if (existingErr) throw new DeckServiceError(existingErr.message, 'db_error')

  if (existing) {
    const { data, error } = await supabase
      .from('deck_cards')
      .update({ quantity: (existing as DeckCardRow).quantity + quantity })
      .eq('id', (existing as DeckCardRow).id)
      .select()
      .single()
    if (error) throw new DeckServiceError(error.message, 'db_error')
    return data as DeckCardRow
  }

  const { data, error } = await supabase
    .from('deck_cards')
    .insert({
      deck_id: deckId,
      scryfall_id: input.scryfall_id,
      oracle_id: input.oracle_id ?? null,
      printing_scryfall_id: input.printing_scryfall_id ?? null,
      finish: input.finish ?? 'nonfoil',
      name: input.name,
      quantity,
    })
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckCardRow
}

export async function removeCard(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string
): Promise<void> {
  await loadOwnedDeckCard(supabase, userId, deckCardId)
  const { error } = await supabase.from('deck_cards').delete().eq('id', deckCardId)
  if (error) throw new DeckServiceError(error.message, 'db_error')
}

export async function setCardQuantity(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  quantity: number
): Promise<DeckCardRow | null> {
  await loadOwnedDeckCard(supabase, userId, deckCardId)
  if (quantity < 0) throw new DeckServiceError('quantity must be >= 0', 'invalid')
  if (quantity === 0) {
    const { error } = await supabase.from('deck_cards').delete().eq('id', deckCardId)
    if (error) throw new DeckServiceError(error.message, 'db_error')
    return null
  }
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ quantity })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckCardRow
}

export async function setCardTags(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  tags: string[]
): Promise<DeckCardRow> {
  await loadOwnedDeckCard(supabase, userId, deckCardId)
  const cleanTags = Array.from(
    new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))
  )
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ tags: cleanTags })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
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
  await loadOwnedDeckCard(supabase, userId, deckCardId)
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ printing_scryfall_id: printingScryfallId })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckCardRow
}

export async function setCardFinish(
  supabase: SupabaseClient,
  userId: string,
  deckCardId: string,
  finish: Finish
): Promise<DeckCardRow> {
  await loadOwnedDeckCard(supabase, userId, deckCardId)
  const { data, error } = await supabase
    .from('deck_cards')
    .update({ finish })
    .eq('id', deckCardId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckCardRow
}

export async function setCommanders(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  scryfallIds: string[]
): Promise<DeckRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  if (scryfallIds.length > 2) {
    throw new DeckServiceError('A deck can have at most 2 commanders', 'invalid')
  }
  const dedup = Array.from(new Set(scryfallIds))
  const { data, error } = await supabase
    .from('decks')
    .update({ commander_scryfall_ids: dedup })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckRow
}

export async function setCoverImage(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  scryfallId: string | null
): Promise<DeckRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  const { data, error } = await supabase
    .from('decks')
    .update({ cover_image_scryfall_id: scryfallId })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckRow
}

export { DeckServiceError }
