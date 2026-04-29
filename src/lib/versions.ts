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
  if (error) return null
  return data as DeckVersionRow
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
