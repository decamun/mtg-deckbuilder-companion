import type { DeckCard } from "@/lib/types"
import { isSideboardZone, zoneCountsTowardMainDeck } from "@/lib/zones"

export type FormatDeckRegistrationInput = {
  deckName: string
  format: string | null
  ownerDisplayName?: string | null
  /** Shown as an ISO date (YYYY-MM-DD) when set */
  generatedAt?: Date
  cards: DeckCard[]
  commanderIds: string[]
}

export type FormatDeckRegistrationResult = {
  text: string
  /** True when at least one line omits set code / collector number */
  hasLinesWithoutPrintData: boolean
}

/**
 * Sort key for tournament registration lists: oracle-style card name (A–Z),
 * then set code, then collector number (numeric-aware).
 */
export function compareDeckRegistrationCards(a: DeckCard, b: DeckCard): number {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  if (byName !== 0) return byName
  const sa = (a.set_code ?? "").toUpperCase().localeCompare((b.set_code ?? "").toUpperCase(), "en")
  if (sa !== 0) return sa
  return (a.collector_number ?? "").localeCompare(b.collector_number ?? "", "en", { numeric: true })
}

function isCommanderCard(c: DeckCard, commanderIds: string[]): boolean {
  return commanderIds.includes(c.scryfall_id)
}

function registrationLine(c: DeckCard): { line: string; hasPrint: boolean } {
  const base = `${c.quantity} ${c.name}`
  if (c.set_code && c.collector_number) {
    return {
      line: `${base} (${c.set_code.toUpperCase()}) ${c.collector_number}`,
      hasPrint: true,
    }
  }
  return { line: base, hasPrint: false }
}

/**
 * Plain-text decklist for tournament / judge registration.
 * Policy: see `docs/deck-registration-format.md`.
 */
export function formatDeckRegistrationText(input: FormatDeckRegistrationInput): FormatDeckRegistrationResult {
  const { deckName, format, ownerDisplayName, generatedAt, cards, commanderIds } = input

  const commanders = cards
    .filter((c) => isCommanderCard(c, commanderIds))
    .slice()
    .sort(compareDeckRegistrationCards)

  const main = cards
    .filter((c) => !isCommanderCard(c, commanderIds) && zoneCountsTowardMainDeck(c.zone))
    .slice()
    .sort(compareDeckRegistrationCards)

  const side = cards.filter((c) => isSideboardZone(c.zone)).slice().sort(compareDeckRegistrationCards)

  let hasLinesWithoutPrintData = false
  const lines: string[] = []

  lines.push(deckName)
  lines.push("—".repeat(Math.min(Math.max(deckName.length, 3), 72)))
  if (format?.trim()) lines.push(`Format: ${format.trim()}`)
  if (ownerDisplayName?.trim()) lines.push(`Player: ${ownerDisplayName.trim()}`)
  if (generatedAt) lines.push(`Generated: ${generatedAt.toISOString().slice(0, 10)}`)
  lines.push("")

  if (commanders.length > 0) {
    lines.push("COMMANDER")
    for (const c of commanders) {
      const { line, hasPrint } = registrationLine(c)
      if (!hasPrint) hasLinesWithoutPrintData = true
      lines.push(line)
    }
    lines.push("")
  }

  lines.push("MAIN DECK")
  for (const c of main) {
    const { line, hasPrint } = registrationLine(c)
    if (!hasPrint) hasLinesWithoutPrintData = true
    lines.push(line)
  }

  if (side.length > 0) {
    lines.push("")
    lines.push("SIDEBOARD")
    for (const c of side) {
      const { line, hasPrint } = registrationLine(c)
      if (!hasPrint) hasLinesWithoutPrintData = true
      lines.push(line)
    }
  }

  lines.push("")
  lines.push(
    "Scope: Commander (by deck commander selection), main deck, and sideboard only. Maybeboard and custom boards are not included.",
  )

  if (hasLinesWithoutPrintData) {
    lines.push(
      "Note: Some lines list name and quantity only because set code or collector number was not available for that card.",
    )
  }

  return { text: lines.join("\n"), hasLinesWithoutPrintData }
}
