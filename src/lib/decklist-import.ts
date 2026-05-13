// Decklist line parser. Accepts MTGO/Arena, Moxfield, TappedOut, Manabox formats.
//   "4 Lightning Bolt"
//   "4x Lightning Bolt"
//   "4 Lightning Bolt (M11) 146"
//   "4 Lightning Bolt (M11) 146 *F*"
//   "4 Lightning Bolt (M11) 146 F"
//   "1 Sol Ring [LEA]"
//   "1 Wear // Tear"            (full split card name)
//   "1 Wear"                    (first-face-only; Scryfall fuzzy-matches to "Wear // Tear")
//
// Zone / section markers supported:
//   "// Deck" | "// Main" | "// Mainboard"       → mainboard (default)
//   "// Sideboard" | "SB: 1 Card Name"            → sideboard
//   "// Maybeboard" | "// Maybe" | "MB: 1 Card"  → maybeboard
//   "// Commander"                                 → commander (mainboard zone, handled upstream)

import { getCardsCollection, getCardBySetAndCN } from "@/lib/scryfall"
import type { DeckCard } from "@/lib/types"

export interface ParsedDecklistLine {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
  foil: boolean
  /** Zone inferred from section markers. Defaults to 'mainboard'. */
  zone: string
}

const FOIL_TAIL = /\s*(?:\*F\*|\*foil\*|\(F\)|\bFOIL\b|\bF\b)\s*$/i
const SET_PAREN = /\s+[\(\[]([A-Za-z0-9]{2,6})[\)\]]\s*([0-9]+[a-zA-Z\-★]?)?\s*$/

/** Matches "SB: 1 Card Name" (MTGO sideboard prefix). */
const SB_PREFIX = /^SB:\s*/i
/** Matches "MB: 1 Card Name" (maybeboard prefix). */
const MB_PREFIX = /^MB:\s*/i

/**
 * Detect if a comment line is a zone section marker.
 * Returns the zone id if it is, or null if it's just a regular comment.
 */
function parseSectionMarkerZone(comment: string): string | null {
  const markerText = comment.replace(/^\/\/\s*/, "").trim().toLowerCase()
  if (markerText === "deck" || markerText === "main" || markerText === "mainboard") return "mainboard"
  if (markerText === "sideboard" || markerText === "side board" || markerText === "side") return "sideboard"
  if (markerText === "maybeboard" || markerText === "maybe board" || markerText === "maybe" || markerText === "considering") return "maybeboard"
  if (markerText === "commander") return "mainboard"
  return null
}

export function parseDecklistLine(raw: string, currentZone = "mainboard"): ParsedDecklistLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("#")) return null

  // Comment lines — not a card entry; zone detection handled separately in parseDecklist.
  if (trimmed.startsWith("//")) return null

  let zone = currentZone
  let body = trimmed

  // Inline zone prefixes (MTGO format): "SB: 1 Card Name" / "MB: 1 Card Name"
  if (SB_PREFIX.test(body)) {
    zone = "sideboard"
    body = body.replace(SB_PREFIX, "")
  } else if (MB_PREFIX.test(body)) {
    zone = "maybeboard"
    body = body.replace(MB_PREFIX, "")
  }

  const qtyMatch = body.match(/^(\d+)[xX]?\s+(.+)$/)
  let quantity = 1
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1
    body = qtyMatch[2]
  }

  let foil = false
  if (FOIL_TAIL.test(body)) {
    foil = true
    body = body.replace(FOIL_TAIL, "").trim()
  }

  let setCode: string | undefined
  let collectorNumber: string | undefined
  const setMatch = body.match(SET_PAREN)
  if (setMatch) {
    setCode = setMatch[1].toUpperCase()
    collectorNumber = setMatch[2]
    body = body.slice(0, setMatch.index).trim()
  }

  // Strip dangling collector number with no set, e.g. "Lightning Bolt 146"
  body = body.replace(/\s+\d+[a-zA-Z\-★]?$/, "").trim()

  const name = body
  if (!name) return null
  return { quantity, name, setCode, collectorNumber, foil, zone }
}

export function parseDecklist(text: string): ParsedDecklistLine[] {
  const out: ParsedDecklistLine[] = []
  let currentZone = "mainboard"
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    // Check for section markers in comment lines.
    if (trimmed.startsWith("//")) {
      const detected = parseSectionMarkerZone(trimmed)
      if (detected !== null) currentZone = detected
      continue
    }
    // Check for inline SB:/MB: prefixes — these override the current zone for that line only.
    const parsed = parseDecklistLine(trimmed, currentZone)
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
    name.includes(" // ") ? name.split(" // ")[0] : name
  const uniqueNames = Array.from(new Set(parsedCards.map((p) => scryfallLookupName(p.name))))
  const scryfallCards = await getCardsCollection(uniqueNames)

  const printingKeys = parsedCards
    .filter((p) => p.setCode && p.collectorNumber)
    .map((p) => `${p.setCode!.toLowerCase()}/${p.collectorNumber!}`)
  const uniquePrintingKeys = Array.from(new Set(printingKeys))
  const printingMap = new Map<string, { id: string; finishes?: string[] }>()
  await Promise.all(
    uniquePrintingKeys.map(async (k) => {
      const [s, cn] = k.split("/")
      const card = await getCardBySetAndCN(s, cn)
      if (card) printingMap.set(k, { id: card.id, finishes: card.finishes })
    }),
  )

  const warnings: string[] = []
  const cards: ResolvedImportCard[] = []

  for (const parsed of parsedCards) {
    const parsedLower = parsed.name.toLowerCase()
    const scryfallCard = scryfallCards.find((c) => {
      const cardLower = c.name.toLowerCase()
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
      zone: parsed.zone ?? "mainboard",
    })
  }

  return { cards, warnings }
}
