import { EXTERNAL_DECK_FETCH_USER_AGENT } from "@/lib/external-deck-providers/constants"
import type { ExternalDeckProvider, ExternalDeckFetchResult } from "@/lib/external-deck-providers/types"

const MOXFIELD_DECK_PATH = /^\/decks\/([A-Za-z0-9_-]+)\/?/

interface MoxfieldEntry {
  quantity?: number
  isFoil?: boolean
  card?: {
    name?: string
    set?: string
    collectorNumber?: string
  } | null
}

interface MoxfieldDeckJson {
  name?: string
  commanders?: Record<string, MoxfieldEntry> | null
  signatureSpells?: Record<string, MoxfieldEntry> | null
  mainboard?: Record<string, MoxfieldEntry> | null
  sideboard?: Record<string, MoxfieldEntry> | null
  maybeboard?: Record<string, MoxfieldEntry> | null
  companions?: Record<string, MoxfieldEntry> | null
  attractions?: Record<string, MoxfieldEntry> | null
  stickers?: Record<string, MoxfieldEntry> | null
}

function linesFromBoard(board: Record<string, MoxfieldEntry> | null | undefined): string[] {
  if (!board) return []
  const lines: string[] = []
  for (const entry of Object.values(board)) {
    const line = moxfieldEntryLine(entry)
    if (line) lines.push(line)
  }
  return lines
}

function moxfieldEntryLine(entry: MoxfieldEntry): string | null {
  const name = entry.card?.name?.trim()
  if (!name) return null
  const qty = Math.max(1, Math.floor(Number(entry.quantity ?? 1)) || 1)
  const setCode = entry.card?.set?.toUpperCase()
  const cn = entry.card?.collectorNumber?.trim()
  const printing = setCode && cn ? ` (${setCode}) ${cn}` : ""
  const foil = entry.isFoil ? " *F*" : ""
  return `${qty} ${name}${printing}${foil}`
}

function moxfieldJsonToDecklist(data: MoxfieldDeckJson): string {
  const commander = [
    ...linesFromBoard(data.commanders),
    ...linesFromBoard(data.signatureSpells),
  ]
  const main = [
    ...linesFromBoard(data.mainboard),
    ...linesFromBoard(data.attractions),
    ...linesFromBoard(data.stickers),
  ]
  const side = [...linesFromBoard(data.sideboard), ...linesFromBoard(data.companions)]
  const maybe = linesFromBoard(data.maybeboard)

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

export const moxfieldProvider: ExternalDeckProvider = {
  id: "moxfield",
  label: "Moxfield",
  hostnames: ["moxfield.com"],

  supportsHost(hostname: string): boolean {
    return (this.hostnames as readonly string[]).includes(hostname)
  },

  async importFromUrl(url: URL): Promise<ExternalDeckFetchResult> {
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (!this.supportsHost(host)) {
      throw new Error("Not a Moxfield deck URL")
    }

    const match = url.pathname.match(MOXFIELD_DECK_PATH)
    const slug = match?.[1]
    if (!slug) {
      throw new Error("Could not read Moxfield deck id from the URL (expected /decks/<publicId>)")
    }

    const apiUrl = `https://api.moxfield.com/v2/decks/all/${encodeURIComponent(slug)}`
    const res = await fetch(apiUrl, {
      headers: {
        "user-agent": EXTERNAL_DECK_FETCH_USER_AGENT,
        accept: "application/json",
      },
      next: { revalidate: 0 },
    })

    const text = await res.text()

    if (!res.ok) {
      if (text.includes("Cloudflare") || text.trimStart().startsWith("<!")) {
        throw new Error(
          "Moxfield blocked this import request (bot protection). Export the deck as text from Moxfield and paste it under New deck, or try Archidekt / TappedOut links.",
        )
      }
      throw new Error(`Moxfield returned HTTP ${res.status}`)
    }

    if (text.trimStart().startsWith("<!")) {
      throw new Error(
        "Moxfield returned an HTML page instead of deck JSON (often temporary bot protection). Try again later, use another host, or paste an exported decklist.",
      )
    }

    let data: MoxfieldDeckJson
    try {
      data = JSON.parse(text) as MoxfieldDeckJson
    } catch {
      throw new Error("Could not parse Moxfield deck JSON")
    }

    const decklistText = moxfieldJsonToDecklist(data)
    if (!decklistText) {
      throw new Error("Moxfield deck contained no importable cards")
    }

    return {
      source: this.id,
      deckName: typeof data.name === "string" ? data.name : null,
      decklistText,
    }
  },
}
