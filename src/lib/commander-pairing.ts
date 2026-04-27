import { ScryfallCard } from "./scryfall"

export type PartnerKind =
  | { kind: "partner" }
  | { kind: "partner-with"; partnerName: string }
  | { kind: "friends-forever" }
  | { kind: "choose-a-background" }
  | { kind: "doctors-companion" }
  | { kind: "time-lord-doctor" }
  | { kind: "background" }

function hasKeyword(card: ScryfallCard, kw: string): boolean {
  const lower = kw.toLowerCase()
  if (card.keywords?.some((k) => k.toLowerCase() === lower)) return true
  return card.oracle_text?.toLowerCase().includes(lower) ?? false
}

function partnerWithName(card: ScryfallCard): string | null {
  const text = card.oracle_text ?? ""
  const match = text.match(/Partner with ([^(\n.]+)/i)
  return match ? match[1].trim().replace(/[.,]+$/, "") : null
}

export function getPartnerKind(card: ScryfallCard): PartnerKind | null {
  const type = card.type_line?.toLowerCase() ?? ""

  if (type.includes("background")) return { kind: "background" }

  const pwName = partnerWithName(card)
  if (pwName) return { kind: "partner-with", partnerName: pwName }

  if (hasKeyword(card, "Friends forever")) return { kind: "friends-forever" }
  if (hasKeyword(card, "Choose a Background")) return { kind: "choose-a-background" }
  if (hasKeyword(card, "Doctor's companion")) return { kind: "doctors-companion" }

  if (type.includes("creature") && type.includes("doctor") && type.includes("time lord")) {
    return { kind: "time-lord-doctor" }
  }

  if (hasKeyword(card, "Partner")) return { kind: "partner" }

  return null
}

/**
 * Build the full Scryfall search query (including the type/role constraint)
 * for finding a legal second commander to pair with `first`. The user's typed
 * text is appended at the call site. Returns null when `first` cannot have a
 * partner.
 */
export function buildPartnerScryfallQuery(first: ScryfallCard): string | null {
  const kind = getPartnerKind(first)
  if (!kind) return null

  switch (kind.kind) {
    case "partner":
      return `is:commander keyword:partner -keyword:"partner with"`
    case "partner-with":
      return `!"${kind.partnerName}"`
    case "friends-forever":
      return `is:commander keyword:"friends forever"`
    case "choose-a-background":
      return `t:background`
    case "background":
      return `is:commander keyword:"choose a background"`
    case "doctors-companion":
      return `is:commander t:doctor t:"time lord"`
    case "time-lord-doctor":
      return `is:commander keyword:"doctor's companion"`
  }
}

export function canPair(first: ScryfallCard, second: ScryfallCard): boolean {
  const a = getPartnerKind(first)
  const b = getPartnerKind(second)
  if (!a || !b) return false

  if (a.kind === "partner" && b.kind === "partner") return true
  if (a.kind === "friends-forever" && b.kind === "friends-forever") return true

  if (a.kind === "partner-with" && b.kind === "partner-with") {
    return (
      a.partnerName.toLowerCase() === second.name.toLowerCase() &&
      b.partnerName.toLowerCase() === first.name.toLowerCase()
    )
  }

  if (a.kind === "choose-a-background" && b.kind === "background") return true
  if (a.kind === "background" && b.kind === "choose-a-background") return true

  if (a.kind === "doctors-companion" && b.kind === "time-lord-doctor") return true
  if (a.kind === "time-lord-doctor" && b.kind === "doctors-companion") return true

  return false
}

export function partnerHelperText(first: ScryfallCard | null): string {
  if (!first) return "Pick a primary commander first"
  const kind = getPartnerKind(first)
  if (!kind) return "This commander can't have a partner"
  switch (kind.kind) {
    case "partner":
      return "Pick another Partner commander"
    case "partner-with":
      return `Must be paired with ${kind.partnerName}`
    case "friends-forever":
      return "Pick another Friends forever commander"
    case "choose-a-background":
      return "Pick a Background"
    case "background":
      return "Pick a commander with Choose a Background"
    case "doctors-companion":
      return "Pick a Time Lord Doctor"
    case "time-lord-doctor":
      return "Pick a commander with Doctor's companion"
  }
}
