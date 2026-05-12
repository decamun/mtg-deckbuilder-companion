import { supabase } from "@/lib/supabase/client"

/** Creates `main` if missing and wires `current_branch_id` / `head_version_id` (owner-only RPC). */
export async function ensureDeckBranchDefaults(deckId: string): Promise<boolean> {
  const { error } = await supabase.rpc("ensure_deck_branch_defaults", { p_deck_id: deckId })
  return !error
}
