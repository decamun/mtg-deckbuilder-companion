import { supabase } from "@/lib/supabase/client"

export interface VersionSnapshotCard {
  scryfall_id: string
  printing_scryfall_id: string | null
  finish: "nonfoil" | "foil" | "etched"
  oracle_id: string | null
  name: string
  quantity: number
  zone: string
  tags: string[]
}

export interface VersionSnapshot {
  version: 1
  deck: {
    name: string
    description: string | null
    format: string | null
    commanders: string[]
    cover_image_scryfall_id: string | null
    is_public: boolean
  }
  cards: VersionSnapshotCard[]
  primer_markdown: string
}

export interface DeckVersionRow {
  id: string
  deck_id: string
  parent_id: string | null
  name: string | null
  is_bookmarked: boolean
  change_summary: string
  snapshot: VersionSnapshot
  created_at: string
  created_by: string | null
}

async function buildSnapshot(deckId: string): Promise<VersionSnapshot | null> {
  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("name, description, format, commander_scryfall_ids, cover_image_scryfall_id, is_public, primer_markdown")
    .eq("id", deckId)
    .single()
  if (deckErr || !deck) return null

  const { data: cards, error: cardsErr } = await supabase
    .from("deck_cards")
    .select("scryfall_id, printing_scryfall_id, finish, oracle_id, name, quantity, zone, tags")
    .eq("deck_id", deckId)
  if (cardsErr) return null

  return {
    version: 1,
    deck: {
      name: deck.name,
      description: deck.description ?? null,
      format: deck.format ?? null,
      commanders: deck.commander_scryfall_ids ?? [],
      cover_image_scryfall_id: deck.cover_image_scryfall_id ?? null,
      is_public: !!deck.is_public,
    },
    cards: (cards ?? []).map(c => ({
      scryfall_id: c.scryfall_id,
      printing_scryfall_id: c.printing_scryfall_id ?? null,
      finish: (c.finish ?? "nonfoil") as VersionSnapshotCard["finish"],
      oracle_id: c.oracle_id ?? null,
      name: c.name,
      quantity: c.quantity,
      zone: c.zone ?? "mainboard",
      tags: c.tags ?? [],
    })),
    primer_markdown: deck.primer_markdown ?? "",
  }
}

interface PendingEntry {
  timer: ReturnType<typeof setTimeout> | null
  summaries: string[]
  parentId: string | null
}

const pending = new Map<string, PendingEntry>()
const DEBOUNCE_MS = 3000

async function getLatestVersionId(deckId: string): Promise<string | null> {
  const { data } = await supabase
    .from("deck_versions")
    .select("id")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function flushDeck(deckId: string) {
  const entry = pending.get(deckId)
  if (!entry) return
  pending.delete(deckId)
  if (entry.timer) clearTimeout(entry.timer)

  const snapshot = await buildSnapshot(deckId)
  if (!snapshot) return

  const { data: { user } } = await supabase.auth.getUser()
  const summary = Array.from(new Set(entry.summaries)).join("; ")
  const parentId = entry.parentId ?? (await getLatestVersionId(deckId))

  await supabase.from("deck_versions").insert({
    deck_id: deckId,
    parent_id: parentId,
    name: null,
    is_bookmarked: false,
    change_summary: summary,
    snapshot,
    created_by: user?.id ?? null,
  })
}

/** Record a version. Coalesces rapid edits into a single row via a 3s debounce. */
export function recordVersion(deckId: string, summary: string) {
  if (!deckId || !summary) return
  let entry = pending.get(deckId)
  if (!entry) {
    entry = { timer: null, summaries: [], parentId: null }
    pending.set(deckId, entry)
  }
  entry.summaries.push(summary)
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => { void flushDeck(deckId) }, DEBOUNCE_MS)
}

/** Force any pending debounced version write to flush now. */
export async function flushPendingVersion(deckId: string): Promise<void> {
  if (pending.has(deckId)) await flushDeck(deckId)
}

/** Insert (or rename the latest unnamed) named version. */
export async function createNamedVersion(
  deckId: string,
  name: string,
  bookmarked: boolean
): Promise<DeckVersionRow | null> {
  await flushPendingVersion(deckId)

  const { data: { user } } = await supabase.auth.getUser()
  const snapshot = await buildSnapshot(deckId)
  if (!snapshot) return null

  const parentId = await getLatestVersionId(deckId)

  const { data, error } = await supabase
    .from("deck_versions")
    .insert({
      deck_id: deckId,
      parent_id: parentId,
      name,
      is_bookmarked: bookmarked,
      change_summary: `Named version: ${name}`,
      snapshot,
      created_by: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return null
  return data as DeckVersionRow
}

export async function getVersions(deckId: string): Promise<DeckVersionRow[]> {
  const { data } = await supabase
    .from("deck_versions")
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false })
  return (data ?? []) as DeckVersionRow[]
}

export async function getVersion(versionId: string): Promise<DeckVersionRow | null> {
  const { data } = await supabase
    .from("deck_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle()
  return (data ?? null) as DeckVersionRow | null
}

export async function setVersionBookmark(versionId: string, bookmarked: boolean) {
  await supabase.from("deck_versions").update({ is_bookmarked: bookmarked }).eq("id", versionId)
}

export async function renameVersion(versionId: string, name: string | null) {
  await supabase.from("deck_versions").update({ name }).eq("id", versionId)
}

export async function deleteVersion(versionId: string) {
  await supabase.from("deck_versions").delete().eq("id", versionId)
}

export async function revertToVersion(deckId: string, versionId: string): Promise<boolean> {
  await flushPendingVersion(deckId)
  const { error } = await supabase.rpc("revert_deck_to_version", {
    p_deck_id: deckId,
    p_version_id: versionId,
  })
  if (error) return false
  // Record a forward "Reverted" version capturing the new state.
  const target = await getVersion(versionId)
  const label = target?.name ? `"${target.name}"` : new Date(target?.created_at ?? Date.now()).toLocaleString()
  recordVersion(deckId, `Reverted to ${label}`)
  await flushPendingVersion(deckId)
  return true
}
