import { EXTERNAL_DECK_FETCH_USER_AGENT } from "@/lib/external-deck-providers/constants"
import type { ExternalDeckProvider, ExternalDeckFetchResult } from "@/lib/external-deck-providers/types"

const ARCHIDEKT_DECK_PATH = /^\/decks\/(\d+)\/?/

interface ArchidektCardRow {
  quantity: number
  categories?: string[] | null
  modifier?: string | null
  card?: {
    collectorNumber?: string | null
    edition?: { editioncode?: string | null } | null
    oracleCard?: { name?: string | null } | null
  } | null
}

interface ArchidektDeckPayload {
  name?: string
  cards?: ArchidektCardRow[]
  error?: string
}

function archidektBucket(categories: string[] | null | undefined): "commander" | "main" | "sideboard" | "maybe" {
  const set = new Set((categories ?? []).map((c) => c.toLowerCase()))
  if (set.has("sideboard")) return "sideboard"
  if (set.has("maybeboard")) return "maybe"
  if (set.has("commander") || set.has("signature spell") || set.has("oathbreaker")) return "commander"
  return "main"
}

function archidektLine(row: ArchidektCardRow): string | null {
  const name = row.card?.oracleCard?.name?.trim()
  if (!name) return null
  const qty = Math.max(1, Math.floor(Number(row.quantity)) || 1)
  const setCode = row.card?.edition?.editioncode?.toUpperCase()
  const cn = row.card?.collectorNumber?.trim()
  const printing =
    setCode && cn ? ` (${setCode}) ${cn}` : ""
  const foil =
    row.modifier?.toLowerCase() === "foil" ? " *F*" : ""
  return `${qty} ${name}${printing}${foil}`
}

function archidektToDecklistText(rows: ArchidektCardRow[]): string {
  const commander: string[] = []
  const main: string[] = []
  const side: string[] = []
  const maybe: string[] = []

  for (const row of rows) {
    const line = archidektLine(row)
    if (!line) continue
    switch (archidektBucket(row.categories)) {
      case "commander":
        commander.push(line)
        break
      case "sideboard":
        side.push(line)
        break
      case "maybe":
        maybe.push(line)
        break
      default:
        main.push(line)
    }
  }

  const chunks: string[] = []
  if (commander.length) {
    chunks.push("// Commander", ...commander, "")
  }
  chunks.push("// Deck", ...main, "")
  if (side.length) {
    chunks.push("// Sideboard", ...side, "")
  }
  if (maybe.length) {
    chunks.push("// Maybeboard", ...maybe, "")
  }
  return chunks.join("\n").trim()
}

export const archidektProvider: ExternalDeckProvider = {
  id: "archidekt",
  label: "Archidekt",
  hostnames: ["archidekt.com"],

  supportsHost(hostname: string): boolean {
    return (this.hostnames as readonly string[]).includes(hostname)
  },

  async importFromUrl(url: URL): Promise<ExternalDeckFetchResult> {
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (!this.supportsHost(host)) {
      throw new Error("Not an Archidekt deck URL")
    }

    const match = url.pathname.match(ARCHIDEKT_DECK_PATH)
    const deckId = match?.[1]
    if (!deckId) {
      throw new Error("Could not read Archidekt deck id from the URL (expected /decks/<id>/…)")
    }

    const apiUrl = `https://archidekt.com/api/decks/${deckId}/`
    const res = await fetch(apiUrl, {
      headers: {
        "user-agent": EXTERNAL_DECK_FETCH_USER_AGENT,
        accept: "application/json",
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "Archidekt deck not found (check the link or privacy settings)"
          : `Archidekt returned HTTP ${res.status}`,
      )
    }

    const payload = (await res.json()) as ArchidektDeckPayload
    if (payload.error) {
      throw new Error(payload.error)
    }

    const cards = payload.cards ?? []
    const decklistText = archidektToDecklistText(cards)
    if (!decklistText) {
      throw new Error("Archidekt deck contained no importable cards")
    }

    return {
      source: this.id,
      deckName: typeof payload.name === "string" ? payload.name : null,
      decklistText,
    }
  },
}
