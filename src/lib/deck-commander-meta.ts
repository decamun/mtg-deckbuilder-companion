import type { ResolvedImportCard } from "@/lib/decklist-import"
import { COMMANDER_ZONE_ID } from "@/lib/zones"

export type CommanderZoneCardRef = Pick<ResolvedImportCard, "zone" | "scryfall_id">

/**
 * Derives `decks.commander_scryfall_ids` and a suggested cover from cards in the
 * commander board zone (see {@link COMMANDER_ZONE_ID}). Order follows the import
 * list; duplicates collapse. At most two Scryfall ids (commander + partner).
 *
 * For two commanders, cover is picked at random between them (either partner may
 * become the deck thumbnail).
 */
export function commanderIdsAndCoverFromResolvedCards(
  cards: readonly CommanderZoneCardRef[],
): { commander_scryfall_ids: string[]; cover_image_scryfall_id: string | null } {
  const commanderLines = cards.filter((c) => c.zone === COMMANDER_ZONE_ID)
  if (commanderLines.length === 0) {
    return { commander_scryfall_ids: [], cover_image_scryfall_id: null }
  }

  const ordered: string[] = []
  const seen = new Set<string>()
  for (const c of commanderLines) {
    if (seen.has(c.scryfall_id)) continue
    seen.add(c.scryfall_id)
    ordered.push(c.scryfall_id)
    if (ordered.length >= 2) break
  }

  const commander_scryfall_ids = ordered
  const cover_image_scryfall_id =
    commander_scryfall_ids.length === 0
      ? null
      : commander_scryfall_ids.length === 1
        ? commander_scryfall_ids[0]
        : commander_scryfall_ids[Math.floor(Math.random() * commander_scryfall_ids.length)]!

  return { commander_scryfall_ids, cover_image_scryfall_id }
}
