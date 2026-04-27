export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  type_line: string
  mana_cost: string
  oracle_text: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  image_uris?: {
    normal: string
    small: string
  }
  set?: string
  set_name?: string
  collector_number?: string
  released_at?: string
  finishes?: string[]
  prices?: {
    usd?: string | null
    usd_foil?: string | null
    usd_etched?: string | null
    eur?: string | null
  }
}

export interface ScryfallPrinting extends ScryfallCard {
  set: string
  set_name: string
  collector_number: string
  released_at: string
  finishes: string[]
}

export async function searchCards(query: string): Promise<ScryfallCard[]> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch (error) {
    console.error("Scryfall search error:", error)
    return []
  }
}

export async function getCard(id: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${id}`)
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error("Scryfall getCard error:", error)
    return null
  }
}

export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error("Scryfall getCardByName error:", error)
    return null
  }
}

async function fetchCollection(identifiers: object[]): Promise<ScryfallCard[]> {
  const CHUNK_SIZE = 75
  const allCards: ScryfallCard[] = []
  for (let i = 0; i < identifiers.length; i += CHUNK_SIZE) {
    const chunk = identifiers.slice(i, i + CHUNK_SIZE)
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk }),
      })
      if (!res.ok) {
        console.error("Scryfall collection error:", await res.text())
        continue
      }
      const json = await res.json()
      if (json.data) allCards.push(...json.data)
    } catch (error) {
      console.error("Scryfall collection fetch error:", error)
    }
    if (i + CHUNK_SIZE < identifiers.length) {
      await new Promise(r => setTimeout(r, 150))
    }
  }
  return allCards
}

/** Batch-fetch cards by Scryfall UUID — max 75 per request, chunked automatically */
export function getCardsByIds(ids: string[]): Promise<ScryfallCard[]> {
  return fetchCollection(ids.map(id => ({ id })))
}

/** Batch-fetch cards by name — max 75 per request, chunked automatically */
export function getCardsCollection(names: string[]): Promise<ScryfallCard[]> {
  return fetchCollection(names.map(name => ({ name })))
}

/** Lookup a specific printing by set + collector number. */
export async function getCardBySetAndCN(set: string, collectorNumber: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(collectorNumber)}`
    )
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error("Scryfall getCardBySetAndCN error:", error)
    return null
  }
}

const printingsByOracleCache = new Map<string, ScryfallPrinting[]>()

/** All printings of a card, sorted oldest-first. Cached per oracle_id for the page lifetime. */
export async function getPrintingsByOracleId(oracleId: string): Promise<ScryfallPrinting[]> {
  if (!oracleId) return []
  const cached = printingsByOracleCache.get(oracleId)
  if (cached) return cached

  const all: ScryfallPrinting[] = []
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released&dir=asc`
  try {
    while (url) {
      const res: Response = await fetch(url)
      if (!res.ok) break
      const json: { data?: ScryfallPrinting[]; has_more?: boolean; next_page?: string } = await res.json()
      if (json.data) all.push(...json.data)
      url = json.has_more && json.next_page ? json.next_page : null
      if (url) await new Promise(r => setTimeout(r, 100))
    }
  } catch (error) {
    console.error("Scryfall getPrintingsByOracleId error:", error)
  }

  printingsByOracleCache.set(oracleId, all)
  return all
}

/** Convenience: oldest printing's scryfall id, or null if oracle not found. */
export async function getOldestPrintingId(oracleId: string): Promise<string | null> {
  const prints = await getPrintingsByOracleId(oracleId)
  return prints[0]?.id ?? null
}
