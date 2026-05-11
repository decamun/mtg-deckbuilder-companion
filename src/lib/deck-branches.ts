import { supabase } from "@/lib/supabase/client"
import type { VersionSnapshot } from "@/lib/versions"
import { appendDeckVersionSnapshot } from "@/lib/versions"

export interface DeckBranchRow {
  id: string
  deck_id: string
  name: string
  head_version_id: string | null
  created_at: string
  updated_at: string
}

export async function listBranches(deckId: string): Promise<DeckBranchRow[]> {
  const { data, error } = await supabase
    .from("deck_branches")
    .select("*")
    .eq("deck_id", deckId)
    .order("name")
  if (error) return []
  return (data ?? []) as DeckBranchRow[]
}

export async function createBranch(deckId: string, name: string): Promise<DeckBranchRow | null> {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (!trimmed) return null
  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("current_branch_id")
    .eq("id", deckId)
    .maybeSingle()
  if (deckErr || !deck?.current_branch_id) return null

  const { data: cur } = await supabase
    .from("deck_branches")
    .select("head_version_id")
    .eq("id", deck.current_branch_id)
    .maybeSingle()

  const { data, error } = await supabase
    .from("deck_branches")
    .insert({
      deck_id: deckId,
      name: trimmed,
      head_version_id: cur?.head_version_id ?? null,
    })
    .select()
    .single()
  if (error) return null
  return data as DeckBranchRow
}

export async function renameBranch(branchId: string, name: string): Promise<boolean> {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (!trimmed) return false
  const { error } = await supabase
    .from("deck_branches")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", branchId)
  return !error
}

export async function switchBranch(deckId: string, branchId: string): Promise<boolean> {
  const { error } = await supabase.rpc("switch_deck_branch", {
    p_deck_id: deckId,
    p_branch_id: branchId,
  })
  return !error
}

export async function deleteBranch(deckId: string, branchId: string): Promise<string | null> {
  const { error } = await supabase.rpc("delete_deck_branch", {
    p_deck_id: deckId,
    p_branch_id: branchId,
  })
  return error?.message ?? null
}

export async function applyMergedSnapshot(
  deckId: string,
  snapshot: VersionSnapshot,
  summary: string
): Promise<boolean> {
  const { error: e1 } = await supabase.rpc("apply_deck_snapshot_json", {
    p_deck_id: deckId,
    p_snapshot: snapshot,
  })
  if (e1) return false
  const row = await appendDeckVersionSnapshot(deckId, summary)
  return !!row
}
