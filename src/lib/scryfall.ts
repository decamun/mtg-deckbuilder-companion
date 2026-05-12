export interface ScryfallImageUris {
  normal?: string
  small?: string
}

export interface ScryfallCardFace {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  image_uris?: ScryfallImageUris
}

/** Scryfall layouts that render both faces as separate images side-by-side. */
const DOUBLE_FACED_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "double_faced_token",
  "reversible_card",
])

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  layout?: string
  type_line: string
  mana_cost: string
  oracle_text: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  image_uris?: ScryfallImageUris
  card_faces?: ScryfallCardFace[]
  set?: string
  set_name?: string
  collector_number?: string
  released_at?: string
  finishes?: string[]
  keywords?: string[]
  /** Commander / constructed legality keys (e.g. `commander: "legal"`). */
  legalities?: Record<string, string>
  /** Colors a card can produce mana of, e.g. ["W","U"]. Includes "C" for colorless. */
  produced_mana?: string[]
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

export interface CardFaceImage {
  name: string
  normal?: string
  small?: string
}

export function getCardFaceImages(card: Pick<ScryfallCard, "name" | "layout" | "image_uris" | "card_faces"> | null | undefined): CardFaceImage[] {
  if (!card) return []

  // Only show separate per-face images for genuinely double-faced layouts.
  // Other multi-face layouts (split, adventure, flip, meld) use a single image.
  if (card.layout && DOUBLE_FACED_LAYOUTS.has(card.layout)) {
    const faces = card.card_faces
      ?.map(face => ({
        name: face.name ?? card.name,
        normal: face.image_uris?.normal,
        small: face.image_uris?.small,
      }))
      .filter(face => Boolean(face.normal ?? face.small))

    if (faces?.length) return faces
  }

  if (card.image_uris?.normal || card.image_uris?.small) {
    return [{
      name: card.name,
      normal: card.image_uris.normal,
      small: card.image_uris.small,
    }]
  }
  return []
}

export function getCardImageUrl(
  card: Pick<ScryfallCard, "name" | "layout" | "image_uris" | "card_faces"> | null | undefined,
  size: "normal" | "small" = "normal"
): string | undefined {
  const faces = getCardFaceImages(card)
  return faces[0]?.[size] ?? faces[0]?.normal ?? faces[0]?.small
}

export async function searchCards(
  query: string,
  options: { unique?: string; order?: string; dir?: "auto" | "asc" | "desc" } = {}
): Promise<ScryfallCard[]> {
  try {
    const url = new URL("https://api.scryfall.com/cards/search")
    url.searchParams.set("q", query)
    if (options.unique) url.searchParams.set("unique", options.unique)
    if (options.order) url.searchParams.set("order", options.order)
    if (options.dir) url.searchParams.set("dir", options.dir)
    const res = await fetch(url.toString())
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch (error) {
    console.error("Scryfall search error:", error)
    return []
  }
}

export async function autocompleteCardNames(query: string): Promise<string[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  try {
    const url = new URL("https://api.scryfall.com/cards/autocomplete")
    url.searchParams.set("q", trimmed)
    const res = await fetch(url.toString())
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json.data) ? json.data.slice(0, 8) : []
  } catch (error) {
    console.error("Scryfall autocomplete error:", error)
    return []
  }
}

/**
 * Module-level cache shared across all helpers in this file. Keyed by
 * Scryfall id. Lifetime = page lifetime — fresh on full reload, no LRU.
 *
 * Realtime updates re-run fetchDeck on every deck_cards change; without this
 * cache, a 100-card deck round-trips ~200KB through Scryfall on every tag edit.
 */
const cardCache = new Map<string, ScryfallCard>()

function rememberCards(cards: ScryfallCard[]) {
  for (const c of cards) cardCache.set(c.id, c)
}

export async function getCard(id: string): Promise<ScryfallCard | null> {
  const hit = cardCache.get(id)
  if (hit) return hit
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${id}`)
    if (!res.ok) return null
    const card = (await res.json()) as ScryfallCard
    cardCache.set(card.id, card)
    return card
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
  // Scryfall: POST /cards/collection is limited to ~2 requests/sec (500ms+ between calls).
  // Bursting chunks at 150ms returns 429; missing cards then fall back to defaults, and CDN
  // 429s on <img> loads are often surfaced by browsers as generic "CORS" image failures.
  const BETWEEN_COLLECTION_CHUNKS_MS = 550
  for (let i = 0; i < identifiers.length; i += CHUNK_SIZE) {
    const chunk = identifiers.slice(i, i + CHUNK_SIZE)
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk }),
      })
      if (!res.ok) {
        console.error("Scryfall collection error:", res.status, await res.text())
        if (i + CHUNK_SIZE < identifiers.length) {
          await new Promise(r => setTimeout(r, BETWEEN_COLLECTION_CHUNKS_MS))
        }
        continue
      }
      const json: { data?: ScryfallCard[]; not_found?: unknown[] } = await res.json()
      if (Array.isArray(json.not_found) && json.not_found.length > 0) {
        console.warn(`Scryfall collection: ${json.not_found.length} identifier(s) not found`, json.not_found)
      }
      if (json.data) allCards.push(...json.data)
    } catch (error) {
      console.error("Scryfall collection fetch error:", error)
    }
    if (i + CHUNK_SIZE < identifiers.length) {
      await new Promise(r => setTimeout(r, BETWEEN_COLLECTION_CHUNKS_MS))
    }
  }
  return allCards
}

/**
 * Batch-fetch cards by Scryfall UUID — max 75 per request, chunked automatically.
 *
 * Cache-aware: ids already in `cardCache` are served locally and only the
 * misses hit Scryfall. Fetched cards are cached for subsequent calls.
 */
export async function getCardsByIds(ids: string[]): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = []
  const missing: string[] = []
  for (const id of ids) {
    const hit = cardCache.get(id)
    if (hit) out.push(hit)
    else missing.push(id)
  }
  if (missing.length === 0) return out
  const fetched = await fetchCollection(missing.map(id => ({ id })))
  rememberCards(fetched)
  return [...out, ...fetched]
}

/** Batch-fetch cards by name — max 75 per request, chunked automatically */
export async function getCardsCollection(names: string[]): Promise<ScryfallCard[]> {
  const fetched = await fetchCollection(names.map(name => ({ name })))
  rememberCards(fetched)
  return fetched
}

/**
 * Batch-fetch one representative card per oracle_id — max 75 per request.
 * Scryfall returns its "preferred" printing (usually a recent reprint with
 * clean imagery). Use this to resolve a display card for unassigned deck slots
 * instead of firing one /cards/search per oracle_id.
 */
export async function getCardsByOracleIds(oracleIds: string[]): Promise<ScryfallCard[]> {
  const fetched = await fetchCollection(oracleIds.map(id => ({ oracle_id: id })))
  rememberCards(fetched)
  return fetched
}

/**
 * Cheap CMC parser. Prefer `card.cmc` directly; fall back to this only when
 * Scryfall didn't return one (e.g. legacy snapshot rows).
 *
 * Limitations: counts `{X}` as 1 and unknown tokens as 1.
 */
export function calculateCmc(manaCost: string | undefined | null): number {
  if (!manaCost) return 0
  const matches = manaCost.match(/\{[^}]+\}/g)
  if (!matches) return 0
  let cmc = 0
  for (const m of matches) {
    const v = parseInt(m.replace(/[{}]/g, ''))
    cmc += isNaN(v) ? 1 : v
  }
  return cmc
}

/** Prefer `sf.cmc` when present; otherwise parse the mana_cost. */
export function cmcOf(card: { cmc?: number; mana_cost?: string } | null | undefined): number {
  if (!card) return 0
  if (typeof card.cmc === 'number') return card.cmc
  return calculateCmc(card.mana_cost)
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

