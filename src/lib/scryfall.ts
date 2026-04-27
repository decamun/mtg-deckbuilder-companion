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

/**
 * Batch-fetch one representative card per oracle_id — max 75 per request.
 * Scryfall returns its "preferred" printing (usually a recent reprint with
 * clean imagery). Use this to resolve a display card for unassigned deck slots
 * instead of firing one /cards/search per oracle_id.
 */
export function getCardsByOracleIds(oracleIds: string[]): Promise<ScryfallCard[]> {
  return fetchCollection(oracleIds.map(id => ({ oracle_id: id })))
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
const inFlightPrintings = new Map<string, Promise<ScryfallPrinting[]>>()

// Single-file FIFO queue: serializes Scryfall search requests with a small
// gap between them. Scryfall asks for 50–100ms between requests; bursting
// 100+ in parallel returns 429s that the browser surfaces as CORS errors
// (their CDN strips Access-Control-Allow-Origin on rate-limit responses).
let scryfallSearchChain: Promise<unknown> = Promise.resolve()
const SCRYFALL_SEARCH_GAP_MS = 110
function queueScryfallSearch<T>(fn: () => Promise<T>): Promise<T> {
  const next = scryfallSearchChain.then(async () => {
    const result = await fn()
    await new Promise(r => setTimeout(r, SCRYFALL_SEARCH_GAP_MS))
    return result
  })
  scryfallSearchChain = next.catch(() => undefined)
  return next
}

/** All printings of a card, sorted oldest-first. Cached per oracle_id for the page lifetime. */
export async function getPrintingsByOracleId(oracleId: string): Promise<ScryfallPrinting[]> {
  if (!oracleId) return []
  const cached = printingsByOracleCache.get(oracleId)
  if (cached) return cached
  const inFlight = inFlightPrintings.get(oracleId)
  if (inFlight) return inFlight

  const promise = queueScryfallSearch(async () => {
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
    return all
  }).then(all => {
    printingsByOracleCache.set(oracleId, all)
    inFlightPrintings.delete(oracleId)
    return all
  }).catch(err => {
    inFlightPrintings.delete(oracleId)
    throw err
  })
  inFlightPrintings.set(oracleId, promise)
  return promise
}

/** Convenience: oldest printing's scryfall id, or null if oracle not found. */
export async function getOldestPrintingId(oracleId: string): Promise<string | null> {
  const prints = await getPrintingsByOracleId(oracleId)
  return prints[0]?.id ?? null
}

// Cache: oracle_id -> oldest ScryfallCard (survives re-renders within a session)
const oldestPrintingByOracle = new Map<string, ScryfallCard>()

/**
 * Resolve the oldest printing for each oracle_id.
 *
 * One search per oracle_id (`unique=prints&order=released&dir=asc`), taking
 * only `data[0]` — the oldest printing by definition. Runs up to 8 in
 * parallel, with a 100ms pause between groups to stay within Scryfall's
 * rate-limit guidance. Results are cached so re-fetches (e.g. Realtime
 * triggers) are instant.
 *
 * Why not a compound `oracleid:A OR oracleid:B` query?  When results contain
 * many printings of one card (basics have 400+), Scryfall may group them
 * rather than interleave globally, so the "first occurrence per oracle_id"
 * heuristic fails for cards that appear late in the response.
 */
export async function getOldestPrintingsByOracleIds(
  oracleIds: string[]
): Promise<Map<string, ScryfallCard>> {
  const result = new Map<string, ScryfallCard>()
  const toFetch: string[] = []

  for (const oid of oracleIds) {
    const hit = oldestPrintingByOracle.get(oid)
    if (hit) { result.set(oid, hit); continue }
    toFetch.push(oid)
  }
  if (toFetch.length === 0) return result

  const fetchOne = async (oid: string): Promise<void> => {
    try {
      const url =
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`oracleid:${oid}`)}&unique=prints&order=released&dir=asc`
      const res = await fetch(url)
      if (!res.ok) return
      const json: { data?: ScryfallCard[] } = await res.json()
      const card = json.data?.[0]
      if (card) {
        result.set(oid, card)
        oldestPrintingByOracle.set(oid, card)
      }
    } catch (err) {
      console.error('getOldestPrintingsByOracleIds error:', err)
    }
  }

  const CONCURRENCY = 8
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    await Promise.all(toFetch.slice(i, i + CONCURRENCY).map(fetchOne))
    if (i + CONCURRENCY < toFetch.length) await new Promise(r => setTimeout(r, 100))
  }

  return result
}
