import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/server"
import { DeckWorkspaceLoading } from "./DeckWorkspaceLoading"

const DeckWorkspaceClient = dynamic(
  () => import("./DeckWorkspaceClient"),
  { loading: () => <DeckWorkspaceLoading /> }
)

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let initialDeckName: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.from("decks").select("name").eq("id", id).maybeSingle()
    initialDeckName = data?.name ?? null
  } catch {
    /* missing env during static analysis / misconfig */
  }

  return <DeckWorkspaceClient deckId={id} initialDeckName={initialDeckName} />
}
