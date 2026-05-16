import { EXTERNAL_DECK_FETCH_USER_AGENT } from "@/lib/external-deck-providers/constants"
import type { ExternalDeckProvider, ExternalDeckFetchResult } from "@/lib/external-deck-providers/types"

/**
 * TappedOut exports use plain section headers like `Sideboard:` instead of
 * `// Sideboard` markers expected by `parseDecklist`.
 */
export function normalizeTappedOutTxt(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  for (const line of lines) {
    const trimmedEnd = line.trimEnd()
    const key = trimmedEnd.trim().toLowerCase()
    if (key === "sideboard:" || key === "side board:") {
      out.push("// Sideboard")
      continue
    }
    if (key === "maybeboard:" || key === "maybe board:") {
      out.push("// Maybeboard")
      continue
    }
    if (key === "commander:" || key === "commanders:") {
      out.push("// Commander")
      continue
    }
    out.push(trimmedEnd)
  }
  return out.join("\n").trim()
}

function validateTappedOutPath(pathname: string): boolean {
  if (!pathname.startsWith("/mtg-decks/") || pathname.includes("..")) return false
  const segments = pathname.split("/").filter(Boolean)
  return segments.length >= 2 && segments[0] === "mtg-decks"
}

function deckTitleFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean)
  const slug = segments[1]
  if (!slug) return null
  const words = slug.split(/[-_]+/).filter(Boolean)
  if (!words.length) return null
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export const tappedOutProvider: ExternalDeckProvider = {
  id: "tappedout",
  label: "TappedOut",
  hostnames: ["tappedout.net"],

  supportsHost(hostname: string): boolean {
    return (this.hostnames as readonly string[]).includes(hostname)
  },

  async importFromUrl(url: URL): Promise<ExternalDeckFetchResult> {
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (!this.supportsHost(host)) {
      throw new Error("Not a TappedOut deck URL")
    }
    if (!validateTappedOutPath(url.pathname)) {
      throw new Error("Unrecognized TappedOut deck path (expected /mtg-decks/…)")
    }

    const fetchUrl = new URL("https://tappedout.net")
    fetchUrl.pathname = url.pathname.replace(/\/+$/, "") || url.pathname
    fetchUrl.searchParams.set("fmt", "txt")

    const res = await fetch(fetchUrl.toString(), {
      headers: {
        "user-agent": EXTERNAL_DECK_FETCH_USER_AGENT,
        accept: "text/plain,*/*",
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      throw new Error(`TappedOut returned HTTP ${res.status}`)
    }

    const ctype = res.headers.get("content-type") ?? ""
    if (ctype.includes("text/html")) {
      throw new Error("TappedOut did not return a text decklist (is the deck private or missing?)")
    }

    const raw = await res.text()
    const decklistText = normalizeTappedOutTxt(raw)
    if (!decklistText) {
      throw new Error("TappedOut export was empty")
    }

    return {
      source: this.id,
      deckName: deckTitleFromPath(url.pathname),
      decklistText,
    }
  },
}
