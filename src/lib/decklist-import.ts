// Decklist line parser. Accepts MTGO/Arena, Moxfield, TappedOut, Manabox formats.
//   "4 Lightning Bolt"
//   "4x Lightning Bolt"
//   "4 Lightning Bolt (M11) 146"
//   "4 Lightning Bolt (M11) 146 *F*"
//   "4 Lightning Bolt (M11) 146 F"
//   "1 Sol Ring [LEA]"

export interface ParsedDecklistLine {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
  foil: boolean
}

const FOIL_TAIL = /\s*(?:\*F\*|\*foil\*|\(F\)|\bFOIL\b|\bF\b)\s*$/i
const SET_PAREN = /\s+[\(\[]([A-Za-z0-9]{2,6})[\)\]]\s*([0-9]+[a-zA-Z\-★]?)?\s*$/

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
