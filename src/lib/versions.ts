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
    budget_usd?: number | string | null
    bracket?: number | null
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
  tags: string[]
  change_summary: string
  snapshot: VersionSnapshot
  created_at: string
  created_by: string | null
}

async function buildSnapshot(deckId: string): Promise<VersionSnapshot | null> {
  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("name, description, format, budget_usd, bracket, commander_scryfall_ids, cover_image_scryfall_id, is_public, primer_markdown")
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
      budget_usd: deck.budget_usd ?? null,
      bracket: deck.bracket ?? null,
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

async function hasVersionSince(deckId: string, sinceIso: string): Promise<boolean> {
  const { data } = await supabase
    .from("deck_versions")
    .select("id")
    .eq("deck_id", deckId)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle()
  return !!data?.id
}

async function insertSnapshotVersion(
  deckId: string,
  name: string | null,
  bookmarked: boolean,
  summary: string,
  parentId?: string | null
): Promise<DeckVersionRow | null> {
  const snapshot = await buildSnapshot(deckId)
  if (!snapshot) return null

  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("deck_versions")
    .insert({
      deck_id: deckId,
      parent_id: parentId ?? (await getLatestVersionId(deckId)),
      name,
      is_bookmarked: bookmarked,
      tags: [],
      change_summary: summary,
      snapshot,
      created_by: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return null
  return data as DeckVersionRow
}

async function createSnapshotVersion(
  deckId: string,
  name: string | null,
  bookmarked: boolean,
  summary: string
): Promise<DeckVersionRow | null> {
  const { data: { user } } = await supabase.auth.getUser()
  const parentId = await getLatestVersionId(deckId)

  const { data, error } = await supabase.rpc("create_deck_version_snapshot", {
    p_deck_id: deckId,
    p_parent_id: parentId,
    p_name: name,
    p_is_bookmarked: bookmarked,
    p_change_summary: summary,
    p_created_by: user?.id ?? null,
  })
  if (error) {
    return insertSnapshotVersion(deckId, name, bookmarked, summary, parentId)
  }
  return data as DeckVersionRow
}

interface PendingEntry {
  timer: ReturnType<typeof setTimeout> | null
  summaries: string[]
  sinceIso: string
}

const pending = new Map<string, PendingEntry>()
const DEBOUNCE_MS = 3000

async function flushDeck(deckId: string) {
  const entry = pending.get(deckId)
  if (!entry) return
  pending.delete(deckId)
  if (entry.timer) clearTimeout(entry.timer)

  if (await hasVersionSince(deckId, entry.sinceIso)) return

  const summary = Array.from(new Set(entry.summaries)).join("; ")
  await insertSnapshotVersion(deckId, null, false, summary)
}

/** Record a fallback client-side version if database triggers did not already create one. */
export function recordVersion(deckId: string, summary: string, sinceIso = new Date().toISOString()) {
  if (!deckId || !summary) return
  let entry = pending.get(deckId)
  if (!entry) {
    entry = { timer: null, summaries: [], sinceIso }
    pending.set(deckId, entry)
  }
  entry.summaries.push(summary)
  if (sinceIso < entry.sinceIso) entry.sinceIso = sinceIso
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
  return createSnapshotVersion(deckId, name, bookmarked, `Named version: ${name}`)
}

export async function getVersions(deckId: string): Promise<DeckVersionRow[]> {
  const { data } = await supabase
    .from("deck_versions")
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false })
  return ((data ?? []) as DeckVersionRow[]).map(row => ({ ...row, tags: row.tags ?? [] }))
}

export async function getVersion(versionId: string): Promise<DeckVersionRow | null> {
  const { data } = await supabase
    .from("deck_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle()
  if (!data) return null
  const row = data as DeckVersionRow
  return { ...row, tags: row.tags ?? [] }
}

export async function setVersionBookmark(versionId: string, bookmarked: boolean) {
  await supabase.from("deck_versions").update({ is_bookmarked: bookmarked }).eq("id", versionId)
}

export async function setVersionTags(versionId: string, tags: string[]) {
  const normalized = Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean)))
  await supabase.from("deck_versions").update({ tags: normalized }).eq("id", versionId)
}

export async function renameVersion(versionId: string, name: string | null) {
  await supabase.from("deck_versions").update({ name }).eq("id", versionId)
}

export async function deleteVersion(versionId: string) {
  await supabase.from("deck_versions").delete().eq("id", versionId)
}

export async function revertToVersion(deckId: string, versionId: string): Promise<boolean> {
  const { error } = await supabase.rpc("revert_deck_to_version", {
    p_deck_id: deckId,
    p_version_id: versionId,
  })
  if (error) return false
  const target = await getVersion(versionId)
  const label = target?.name ? `"${target.name}"` : new Date(target?.created_at ?? Date.now()).toLocaleString()
  await createSnapshotVersion(deckId, null, false, `Reverted to ${label}`)
  return true
}
