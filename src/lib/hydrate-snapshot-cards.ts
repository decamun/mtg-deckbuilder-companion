import { pickPrice } from "@/lib/format"
import { getCardFaceImages, getCardImageUrl, getCardsByIds, cmcOf } from "@/lib/scryfall"
import type { DeckCard } from "@/lib/types"
import type { VersionSnapshot } from "@/lib/versions"

/** Build editor-style deck cards from a stored version snapshot (for diffs, merge preview, etc.). */
export async function hydrateSnapshotToDeckCards(
  deckId: string,
  snap: VersionSnapshot,
  idPrefix: string
): Promise<{ cards: DeckCard[]; coverImageUrl: string | null }> {
  const ids = new Set<string>()
  for (const c of snap.cards) ids.add(c.printing_scryfall_id || c.scryfall_id)
  if (snap.deck.cover_image_scryfall_id) ids.add(snap.deck.cover_image_scryfall_id)

  const sfCards = await getCardsByIds(Array.from(ids))
  const sfMap = new Map(sfCards.map(c => [c.id, c]))

  const hydrated: DeckCard[] = snap.cards.map((c, i) => {
    const baseSf = sfMap.get(c.scryfall_id)
    const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
    const effectiveId = c.printing_scryfall_id || c.scryfall_id
    const effSf = sfMap.get(effectiveId) ?? baseSf
    const faceImages = getCardFaceImages(effSf)
    return {
      id: `${idPrefix}-${i}`,
      deck_id: deckId,
      scryfall_id: c.scryfall_id,
      printing_scryfall_id: c.printing_scryfall_id,
      finish: c.finish,
      oracle_id: oracleId,
      name: c.name,
      quantity: c.quantity,
      zone: c.zone,
      tags: c.tags,
      image_url: getCardImageUrl(effSf),
      face_images: faceImages,
      type_line: effSf?.type_line || "",
      mana_cost: effSf?.mana_cost || "",
      cmc: cmcOf(effSf),
      colors: effSf?.colors ?? [],
      color_identity: effSf?.color_identity ?? [],
      legalities: effSf?.legalities,
      oracle_text: effSf?.oracle_text || "",
      produced_mana: effSf?.produced_mana ?? [],
      set_code: effSf?.set,
      collector_number: effSf?.collector_number,
      available_finishes: effSf?.finishes,
      price_usd: pickPrice(effSf?.prices, c.finish),
      effective_printing_id: effectiveId,
    }
  })

  const coverId = snap.deck.cover_image_scryfall_id
  const coverImageUrl = coverId ? (getCardImageUrl(sfMap.get(coverId)) ?? null) : null

  return { cards: hydrated, coverImageUrl }
}
