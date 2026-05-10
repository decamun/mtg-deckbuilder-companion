import type { SupabaseClient } from "@supabase/supabase-js"
import { getDecklist, listDecks } from "@/lib/deck-service"
import { getCardsByIds, type ScryfallCard } from "@/lib/scryfall"

export async function loadUserDeckScryfallPrintings(
  supabase: SupabaseClient,
  userId: string,
  deckNameQuery: string
): Promise<{ deckId: string; deckName: string; cards: ScryfallCard[] }> {
  const q = deckNameQuery.trim().toLowerCase()
  if (!q) throw new Error("Enter a deck name.")

  const decks = await listDecks(supabase, userId)
  const exact = decks.find(d => d.name.trim().toLowerCase() === q)
  const partial =
    exact ??
    decks.find(d => d.name.toLowerCase().includes(q)) ??
    decks.find(d => q.includes(d.name.trim().toLowerCase()))

  if (!partial) {
    throw new Error(`No deck found matching "${deckNameQuery.trim()}".`)
  }

  const rows = await getDecklist(supabase, userId, partial.id)
  const ids = [...new Set(rows.map(r => r.printing_scryfall_id || r.scryfall_id))]
  const sf = await getCardsByIds(ids)
  const map = new Map(sf.map(c => [c.id, c]))
  const cards: ScryfallCard[] = []
  for (const row of rows) {
    const id = row.printing_scryfall_id || row.scryfall_id
    const c = map.get(id)
    if (c) cards.push(c)
  }

  return { deckId: partial.id, deckName: partial.name, cards }
}
