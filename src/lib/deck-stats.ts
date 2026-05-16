import type { DeckCardRow, DeckRow } from '@/lib/deck-service'
import { pickPrice } from '@/lib/format'
import { getCardsByIds, cmcOf } from '@/lib/scryfall'
import {
  computeDeckStatsReport,
  type DeckStatsCard,
  type DeckStatsReport,
} from '@/lib/deck-stats-compute'
import { DEFAULT_CARD_ZONE_ID } from '@/lib/zones'

export type { DeckStatsCard, DeckStatsReport } from '@/lib/deck-stats-compute'

/**
 * Hydrate DB deck rows with Scryfall data (same rules as the deck editor page).
 */
export async function hydrateDeckStatsCards(rows: DeckCardRow[]): Promise<DeckStatsCard[]> {
  const idsToFetch = new Set<string>()
  for (const c of rows) idsToFetch.add(c.printing_scryfall_id || c.scryfall_id)
  const sfCards = await getCardsByIds(Array.from(idsToFetch))
  const sfMap = new Map(sfCards.map(c => [c.id, c]))

  return rows.map(c => {
    const baseSf = sfMap.get(c.scryfall_id)
    const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
    const effectiveId = c.printing_scryfall_id || c.scryfall_id
    const effSf = sfMap.get(effectiveId) ?? baseSf
    const finish = (c.finish ?? 'nonfoil') as 'nonfoil' | 'foil' | 'etched'
    return {
      id: c.id,
      scryfall_id: c.scryfall_id,
      oracle_id: oracleId,
      name: c.name,
      quantity: c.quantity,
      zone: c.zone ?? DEFAULT_CARD_ZONE_ID,
      tags: c.tags,
      type_line: effSf?.type_line || '',
      mana_cost: effSf?.mana_cost || '',
      cmc: cmcOf(effSf),
      colors: effSf?.colors ?? [],
      color_identity: effSf?.color_identity ?? [],
      legalities: effSf?.legalities,
      oracle_text: effSf?.oracle_text || '',
      produced_mana: effSf?.produced_mana ?? [],
      price_usd: pickPrice(effSf?.prices, finish),
    }
  })
}

export async function buildDeckStatsReport(deck: DeckRow, rows: DeckCardRow[]): Promise<DeckStatsReport> {
  const hydrated = await hydrateDeckStatsCards(rows)
  return computeDeckStatsReport(deck, hydrated)
}
