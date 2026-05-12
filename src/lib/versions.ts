import { supabase } from "@/lib/supabase/client"
import { ensureDeckBranchDefaults } from "@/lib/ensure-deck-branch-defaults"

/**
 * Deck version snapshots are full JSON deck states per row (simple replay and RLS-friendly).
 * For very large histories, consider future optimizations: parent-relative deltas, external blob storage,
 * or periodic compaction — branching keeps hot history scoped per `branch_id` for smaller timelines.
 */

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
  branch_id: string
  parent_id: string | null
  name: string | null
  is_bookmarked: boolean
  tags: string[]
  change_summary: string
  snapshot: VersionSnapshot
  created_at: string
  created_by: string | null
}

async function hasVersionSinceOnBranch(deckId: string, sinceIso: string): Promise<boolean> {
  const { data: deck } = await supabase
    .from("decks")
    .select("current_branch_id")
    .eq("id", deckId)
    .maybeSingle()
  const branchId = deck?.current_branch_id as string | undefined
  if (!branchId) return false

  const { data } = await supabase
    .from("deck_versions")
    .select("id")
    .eq("deck_id", deckId)
    .eq("branch_id", branchId)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle()
  return !!data?.id
}

async function createSnapshotVersion(
  deckId: string,
  name: string | null,
  bookmarked: boolean,
  summary: string,
  explicitParentId?: string | null
): Promise<DeckVersionRow | null> {
  const { data: deckRow } = await supabase.from("decks").select("current_branch_id").eq("id", deckId).maybeSingle()
  if (!(deckRow?.current_branch_id as string | undefined)) {
    await ensureDeckBranchDefaults(deckId)
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.rpc("create_deck_version_snapshot", {
    p_deck_id: deckId,
    p_parent_id: explicitParentId ?? null,
    p_name: name,
    p_is_bookmarked: bookmarked,
    p_change_summary: summary,
    p_created_by: user?.id ?? null,
  })
  if (error) return null
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

  if (await hasVersionSinceOnBranch(deckId, entry.sinceIso)) return

  const summary = Array.from(new Set(entry.summaries)).join("; ")
  await createSnapshotVersion(deckId, null, false, summary)
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

/** All versions on a branch timeline, including the shared fork tip when it lives on another branch. */
export async function getVersionsForBranch(deckId: string, branchId: string): Promise<DeckVersionRow[]> {
  const { data: br } = await supabase
    .from("deck_branches")
    .select("head_version_id")
    .eq("id", branchId)
    .maybeSingle()
  const headId = br?.head_version_id as string | undefined

  const { data: timelineRows, error } = await supabase
    .from("deck_versions")
    .select("*")
    .eq("deck_id", deckId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
  if (error) return []

  const byId = new Map<string, DeckVersionRow>()
  for (const row of (timelineRows ?? []) as DeckVersionRow[]) {
    byId.set(row.id, { ...row, tags: row.tags ?? [] })
  }

  if (headId && !byId.has(headId)) {
    const { data: headRow } = await supabase
      .from("deck_versions")
      .select("*")
      .eq("deck_id", deckId)
      .eq("id", headId)
      .maybeSingle()
    if (headRow) {
      const r = headRow as DeckVersionRow
      byId.set(r.id, { ...r, tags: r.tags ?? [] })
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

/** Full version graph for merge-base computation (same deck). */
export async function getDeckVersionAncestry(
  deckId: string
): Promise<{ id: string; parent_id: string | null; snapshot: VersionSnapshot }[]> {
  const { data } = await supabase
    .from("deck_versions")
    .select("id, parent_id, snapshot")
    .eq("deck_id", deckId)
  return (data ?? []) as { id: string; parent_id: string | null; snapshot: VersionSnapshot }[]
}

/** Latest version id per tag across the whole deck (not scoped to the current branch). */
export async function getLatestVersionIdPerTagForDeck(deckId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("deck_versions")
    .select("id, tags, created_at")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false })
  if (error || !data) return new Map()
  const out = new Map<string, string>()
  for (const row of data as { id: string; tags: string[] | null }[]) {
    for (const tag of row.tags ?? []) {
      const t = tag.trim()
      if (t && !out.has(t)) out.set(t, row.id)
    }
  }
  return out
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
  await createSnapshotVersion(deckId, null, false, `Reverted to ${label}`, versionId)
  return true
}

/** Record a new snapshot from the live deck (used after merge apply). */
export async function appendDeckVersionSnapshot(
  deckId: string,
  summary: string,
  explicitParentId?: string | null
): Promise<DeckVersionRow | null> {
  return createSnapshotVersion(deckId, null, false, summary, explicitParentId)
}
