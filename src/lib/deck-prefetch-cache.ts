import { getCardsByIds } from "@/lib/scryfall"

/** Raw `deck_cards` row shape from Supabase (matches `select('*')`). */
export type DeckCardDbRow = Record<string, unknown> & {
  scryfall_id?: string
  printing_scryfall_id?: string | null
}

const deckCardsByDeck = new Map<string, { rows: DeckCardDbRow[]; fetchedAt: number }>()

export function storePrefetchedDeckCards(deckId: string, rows: DeckCardDbRow[]) {
  deckCardsByDeck.set(deckId, { rows, fetchedAt: Date.now() })
}

export function getPrefetchedDeckCards(deckId: string, maxAgeMs: number): DeckCardDbRow[] | null {
  const e = deckCardsByDeck.get(deckId)
  if (!e || Date.now() - e.fetchedAt > maxAgeMs) return null
  return e.rows
}

function collectScryfallIds(
  deck: { cover_image_scryfall_id?: string | null },
  rows: DeckCardDbRow[]
): string[] {
  const ids = new Set<string>()
  for (const c of rows) {
    const sid = typeof c.scryfall_id === "string" ? c.scryfall_id : null
    const pid = typeof c.printing_scryfall_id === "string" ? c.printing_scryfall_id : null
    if (pid) ids.add(pid)
    else if (sid) ids.add(sid)
  }
  const cover = deck.cover_image_scryfall_id
  if (typeof cover === "string" && cover.length > 0) ids.add(cover)
  return [...ids]
}

/** Warms the in-memory Scryfall cache used by `getCardsByIds` (fire-and-forget). */
export function warmScryfallForDeckRows(
  deck: { cover_image_scryfall_id?: string | null },
  rows: DeckCardDbRow[]
) {
  const ids = collectScryfallIds(deck, rows)
  if (ids.length === 0) return
  void getCardsByIds(ids)
}
