import type { SupabaseClient } from '@supabase/supabase-js'
import type { VersionSnapshot } from './versions'
import {
  buildMergedSnapshot,
  collectAllMergeConflicts,
  defaultConflictChoices,
  findMergeBaseVersionId,
  getSnapshotAtVersionId,
  type ConflictChoices,
} from './deck-branch-merge'
import { getCard, type ScryfallCard } from './scryfall'

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
  current_branch_id?: string | null
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

async function hasVersionSinceOnBranch(
  supabase: SupabaseClient,
  deckId: string,
  sinceIso: string
): Promise<boolean> {
  const { data: deck } = await supabase
    .from('decks')
    .select('current_branch_id')
    .eq('id', deckId)
    .maybeSingle()
  const branchId = deck?.current_branch_id as string | undefined
  if (!branchId) return false

  const { data } = await supabase
    .from('deck_versions')
    .select('id')
    .eq('deck_id', deckId)
    .eq('branch_id', branchId)
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
  if (await hasVersionSinceOnBranch(supabase, deckId, sinceIso)) return

  const { error } = await supabase.rpc('create_deck_version_snapshot', {
    p_deck_id: deckId,
    p_parent_id: null,
    p_name: null,
    p_is_bookmarked: false,
    p_change_summary: summary,
    p_created_by: userId,
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
  await loadOwnedDeck(supabase, userId, deckId)
  const quantity = input.quantity ?? 1
  if (quantity < 1) throw new DeckServiceError('quantity must be >= 1', 'invalid')
  const versionSince = new Date().toISOString()
  const scryfallCard = await resolveScryfallCard(input.scryfall_id, 'scryfall_id')
  const printingCard = input.printing_scryfall_id
    ? await resolveScryfallCard(input.printing_scryfall_id, 'printing_scryfall_id')
    : null
  if (printingCard) assertSameOracle(scryfallCard, printingCard)

  const { data: existing, error: existingErr } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
    .eq('scryfall_id', scryfallCard.id)
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
    await recordDeckVersion(
      supabase,
      userId,
      deckId,
      `Increased ${(existing as DeckCardRow).name} to ${(existing as DeckCardRow).quantity + quantity}`,
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
  const { card } = await loadOwnedDeckCard(supabase, userId, deckCardId)
  if (quantity < 0) throw new DeckServiceError('quantity must be >= 0', 'invalid')
  const versionSince = new Date().toISOString()
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
  await loadOwnedDeck(supabase, userId, deckId)
  if (scryfallIds.length > 2) {
    throw new DeckServiceError('A deck can have at most 2 commanders', 'invalid')
  }
  const uniqueCommanderIds = Array.from(new Set(scryfallIds))
  const commanderCards = await Promise.all(
    uniqueCommanderIds.map((id) => resolveScryfallCard(id, 'commander_scryfall_ids'))
  )
  const dedup = Array.from(new Set(commanderCards.map((card) => card.id)))
  const versionSince = new Date().toISOString()
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

export interface DeckBranchRow {
  id: string
  deck_id: string
  name: string
  head_version_id: string | null
  created_at: string
  updated_at: string
}

export async function listDeckBranches(
  supabase: SupabaseClient,
  userId: string,
  deckId: string
): Promise<DeckBranchRow[]> {
  await loadOwnedDeck(supabase, userId, deckId)
  const { data, error } = await supabase
    .from('deck_branches')
    .select('*')
    .eq('deck_id', deckId)
    .order('name')
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return (data ?? []) as DeckBranchRow[]
}

export async function createDeckBranch(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  name: string
): Promise<DeckBranchRow> {
  await loadOwnedDeck(supabase, userId, deckId)
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new DeckServiceError('Branch name is required', 'invalid')

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('current_branch_id')
    .eq('id', deckId)
    .maybeSingle()
  if (deckErr || !deck?.current_branch_id) {
    throw new DeckServiceError('Deck has no active branch', 'invalid')
  }

  const { data: cur } = await supabase
    .from('deck_branches')
    .select('head_version_id')
    .eq('id', deck.current_branch_id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('deck_branches')
    .insert({
      deck_id: deckId,
      name: trimmed,
      head_version_id: cur?.head_version_id ?? null,
    })
    .select()
    .single()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  return data as DeckBranchRow
}

export async function switchDeckBranch(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  branchId: string
): Promise<void> {
  await loadOwnedDeck(supabase, userId, deckId)
  const { error } = await supabase.rpc('switch_deck_branch', {
    p_deck_id: deckId,
    p_branch_id: branchId,
  })
  if (error) throw new DeckServiceError(error.message, 'db_error')
}

export async function switchDeckBranchByName(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  branchName: string
): Promise<void> {
  await loadOwnedDeck(supabase, userId, deckId)
  const { data, error } = await supabase
    .from('deck_branches')
    .select('id')
    .eq('deck_id', deckId)
    .eq('name', branchName.trim())
    .maybeSingle()
  if (error) throw new DeckServiceError(error.message, 'db_error')
  if (!data?.id) throw new DeckServiceError(`Branch "${branchName}" not found`, 'not_found')
  await switchDeckBranch(supabase, userId, deckId, data.id)
}

export async function mergeDeckBranchIntoCurrent(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  sourceBranchId: string,
  conflictDefault: 'ours' | 'theirs',
  conflictOverrides?: ConflictChoices
): Promise<{ conflictCount: number }> {
  const deck = await loadOwnedDeck(supabase, userId, deckId)
  const destBranchId = deck.current_branch_id
  if (!destBranchId) throw new DeckServiceError('Deck has no active branch', 'invalid')
  if (sourceBranchId === destBranchId) {
    throw new DeckServiceError('Cannot merge a branch into itself', 'invalid')
  }

  const { data: branches, error: brErr } = await supabase
    .from('deck_branches')
    .select('id, name, head_version_id')
    .eq('deck_id', deckId)
  if (brErr) throw new DeckServiceError(brErr.message, 'db_error')

  const destBr = branches?.find((b) => b.id === destBranchId)
  const srcBr = branches?.find((b) => b.id === sourceBranchId)
  if (!destBr?.head_version_id) {
    throw new DeckServiceError('Current branch has no version history to merge against', 'invalid')
  }
  if (!srcBr?.head_version_id) {
    throw new DeckServiceError('Source branch has no snapshots yet', 'invalid')
  }

  const { data: graph, error: gErr } = await supabase
    .from('deck_versions')
    .select('id, parent_id, snapshot')
    .eq('deck_id', deckId)
  if (gErr) throw new DeckServiceError(gErr.message, 'db_error')

  const rows = graph ?? []
  const lcaId = findMergeBaseVersionId(rows, destBr.head_version_id, srcBr.head_version_id)
  const baseSnap = getSnapshotAtVersionId(rows, lcaId)
  const destRow = rows.find((r) => r.id === destBr.head_version_id)
  const srcRow = rows.find((r) => r.id === srcBr.head_version_id)
  const destSnap = destRow?.snapshot as VersionSnapshot | undefined
  const srcSnap = srcRow?.snapshot as VersionSnapshot | undefined
  if (!destSnap || !srcSnap) {
    throw new DeckServiceError('Could not load branch snapshots', 'db_error')
  }

  const conflicts = collectAllMergeConflicts(baseSnap, destSnap, srcSnap)
  const choices: ConflictChoices = {
    ...defaultConflictChoices(conflicts, conflictDefault),
    ...conflictOverrides,
  }
  const merged = buildMergedSnapshot(baseSnap, destSnap, srcSnap, choices)

  const { error: e1 } = await supabase.rpc('apply_deck_snapshot_json', {
    p_deck_id: deckId,
    p_snapshot: merged,
  })
  if (e1) throw new DeckServiceError(e1.message, 'db_error')

  const { error: e2 } = await supabase.rpc('create_deck_version_snapshot', {
    p_deck_id: deckId,
    p_parent_id: null,
    p_name: null,
    p_is_bookmarked: false,
    p_change_summary: `Merged branch "${srcBr.name}" into "${destBr.name}"`,
    p_created_by: userId,
  })
  if (e2) throw new DeckServiceError(e2.message, 'db_error')

  return { conflictCount: conflicts.length }
}

export async function mergeDeckBranchByName(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  sourceBranchName: string,
  conflictDefault: 'ours' | 'theirs',
  conflictOverrides?: ConflictChoices
): Promise<{ conflictCount: number }> {
  const branches = await listDeckBranches(supabase, userId, deckId)
  const br = branches.find((b) => b.name === sourceBranchName)
  if (!br) throw new DeckServiceError(`Branch "${sourceBranchName}" not found`, 'not_found')
  return mergeDeckBranchIntoCurrent(supabase, userId, deckId, br.id, conflictDefault, conflictOverrides)
}

export { DeckServiceError }
