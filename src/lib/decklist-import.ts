// Decklist line parser. Accepts MTGO/Arena, Moxfield, TappedOut, Manabox formats.
//   "4 Lightning Bolt"
//   "4x Lightning Bolt"
//   "4 Lightning Bolt (M11) 146"
//   "4 Lightning Bolt (M11) 146 *F*"
//   "4 Lightning Bolt (M11) 146 F"
//   "1 Sol Ring [LEA]"
//   "1 Wear // Tear"            (full split card name)
//   "1 Wear"                    (first-face-only; Scryfall fuzzy-matches to "Wear // Tear")

import { getCardsCollection, getCardBySetAndCN } from "@/lib/scryfall"
import type { DeckCard } from "@/lib/types"

export interface ParsedDecklistLine {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
  foil: boolean
}

const FOIL_TAIL = /\s*(?:\*F\*|\*foil\*|\(F\)|\bFOIL\b|\bF\b)\s*$/i
const SET_PAREN = /\s+[\(\[]([A-Za-z0-9]{2,6})[\)\]]\s*([0-9]+[a-zA-Z\-★]?)?\s*$/

function stripTrailingFoil(body: string): { body: string; foil: boolean } {
  if (!FOIL_TAIL.test(body)) return { body, foil: false }
  return { body: body.replace(FOIL_TAIL, "").trim(), foil: true }
}

/** Normalize pasted names (curly quotes, NBSP) for resilient Scryfall matching. */
export function normalizeDecklistCardName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function parseDecklistLine(raw: string): ParsedDecklistLine | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return null

  const qtyMatch = trimmed.match(/^(\d+)[xX]?\s+(.+)$/)
  let quantity = 1
  let body = trimmed
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1
    body = qtyMatch[2]
  }

  let foil = false
  const firstFoil = stripTrailingFoil(body)
  if (firstFoil.foil) {
    foil = true
    body = firstFoil.body
  }

  let setCode: string | undefined
  let collectorNumber: string | undefined
  const setMatch = body.match(SET_PAREN)
  if (setMatch) {
    setCode = setMatch[1].toUpperCase()
    collectorNumber = setMatch[2]
    body = body.slice(0, setMatch.index).trim()
    // Exporters often put foil *before* the (SET) CN block, e.g. "Card *F* (EOC) 1"
    const afterSetFoil = stripTrailingFoil(body)
    if (afterSetFoil.foil) {
      foil = true
      body = afterSetFoil.body
    }
  }

  // Strip dangling collector number with no set, e.g. "Lightning Bolt 146"
  body = body.replace(/\s+\d+[a-zA-Z\-★]?$/, "").trim()

  const name = normalizeDecklistCardName(body)
  if (!name) return null
  return { quantity, name, setCode, collectorNumber, foil }
}

export function parseDecklist(text: string): ParsedDecklistLine[] {
  const out: ParsedDecklistLine[] = []
  for (const line of text.split("\n")) {
    const parsed = parseDecklistLine(line)
    if (parsed) out.push(parsed)
  }
  return out
}

export interface ResolvedImportCard {
  name: string
  quantity: number
  scryfall_id: string
  oracle_id: string | null
  printing_scryfall_id: string | null
  finish: "nonfoil" | "foil" | "etched"
  zone: string
}

export interface DecklistResolveResult {
  cards: ResolvedImportCard[]
  warnings: string[]
}

/**
 * Parses a decklist string and resolves each entry to a Scryfall-backed card.
 *
 * preservePrintings: if true and existingCards is provided, cards already in
 * the deck keep their current printing_scryfall_id and finish.
 */
export async function resolveDecklist(
  text: string,
  opts?: {
    preservePrintings?: boolean
    existingCards?: DeckCard[]
  },
): Promise<DecklistResolveResult> {
  const parsedCards = parseDecklist(text)
  if (parsedCards.length === 0) return { cards: [], warnings: [] }

  // For split/adventure cards (e.g. "Wear // Tear") Scryfall's /cards/collection
  // endpoint fuzzy-matches by the primary face name only; sending the full " // "
  // form causes the entry to land in `not_found`.  Normalize to the primary face
  // here — the matching logic below still handles both exact and face-name forms.
  const scryfallLookupName = (name: string) =>
    name.includes(" // ") ? normalizeDecklistCardName(name.split(" // ")[0]!) : normalizeDecklistCardName(name)
  const uniqueNames = Array.from(new Set(parsedCards.map((p) => scryfallLookupName(p.name))))
  const scryfallCards = await getCardsCollection(uniqueNames)

  const printingKeys = parsedCards
    .filter((p) => p.setCode && p.collectorNumber)
    .map((p) => `${p.setCode!.toLowerCase()}/${p.collectorNumber!}`)
  const uniquePrintingKeys = Array.from(new Set(printingKeys))
  const printingMap = new Map<string, { id: string; finishes?: string[] }>()
  // Space calls slightly: Scryfall documents ~10 req/s for file fetches; parallel
  // set+cn bursts can 429 and drop printings from the map.
  const PRINTING_LOOKUP_GAP_MS = 75
  for (const k of uniquePrintingKeys) {
    const [s, cn] = k.split("/")
    const card = await getCardBySetAndCN(s, cn)
    if (card) printingMap.set(k, { id: card.id, finishes: card.finishes })
    await new Promise(r => setTimeout(r, PRINTING_LOOKUP_GAP_MS))
  }

  const warnings: string[] = []
  const cards: ResolvedImportCard[] = []

  for (const parsed of parsedCards) {
    const parsedLower = parsed.name.toLowerCase()
    const scryfallCard = scryfallCards.find((c) => {
      const cardLower = normalizeDecklistCardName(c.name).toLowerCase()
      // Exact match (handles full split names like "Wear // Tear")
      if (cardLower === parsedLower) return true
      // Face-name match: Scryfall returns "Wear // Tear" but user typed only "Wear"
      const primaryFace = cardLower.split(" // ")[0]
      return primaryFace === parsedLower
    })
    if (!scryfallCard) {
      warnings.push(`Could not find card: ${parsed.name}`)
      continue
    }

    let printingId: string | null = null
    let finish: "nonfoil" | "foil" | "etched" = "nonfoil"

    // When preserving printings, carry over the existing card's printing/finish.
    const existing =
      opts?.preservePrintings && opts.existingCards
        ? opts.existingCards.find(
            (c) =>
              (scryfallCard.oracle_id && c.oracle_id === scryfallCard.oracle_id) ||
              c.name.toLowerCase() === parsed.name.toLowerCase(),
          )
        : undefined

    if (existing) {
      printingId = existing.printing_scryfall_id
      finish = existing.finish
    } else {
      if (parsed.setCode && parsed.collectorNumber) {
        const k = `${parsed.setCode.toLowerCase()}/${parsed.collectorNumber}`
        const hit = printingMap.get(k)
        if (hit) {
          printingId = hit.id
          if (parsed.foil) {
            if (hit.finishes?.includes("foil")) finish = "foil"
            else warnings.push(`${parsed.name}: foil not available for this printing — saved as non-foil`)
          }
        }
      } else if (parsed.foil) {
        finish = "foil"
      }
    }

    cards.push({
      name: scryfallCard.name,
      quantity: parsed.quantity,
      scryfall_id: scryfallCard.id,
      oracle_id: scryfallCard.oracle_id ?? null,
      printing_scryfall_id: printingId,
      finish,
      zone: "mainboard",
    })
  }

  return { cards, warnings }
}
