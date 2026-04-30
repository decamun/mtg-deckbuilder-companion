"use client"

import type { ReactNode } from "react"

const TOKEN_LABELS: Record<string, string> = {
  T: "tap",
  Q: "untap",
  E: "energy",
  S: "snow",
  C: "colorless",
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
}

type ManaTextProps = {
  text?: string | null
  className?: string
  symbolClassName?: string
}

function tokenLabel(token: string) {
  const parts = token.split("/")
  if (parts.length > 1) return `${parts.map(part => TOKEN_LABELS[part] ?? part).join(" or ")} mana`
  return TOKEN_LABELS[token] ? `${TOKEN_LABELS[token]} mana` : `${token} mana`
}

function symbolTone(token: string) {
  const colors = new Set(token.split("/"))
  if (colors.has("W")) return "mana-symbol-w"
  if (colors.has("U")) return "mana-symbol-u"
  if (colors.has("B")) return "mana-symbol-b"
  if (colors.has("R")) return "mana-symbol-r"
  if (colors.has("G")) return "mana-symbol-g"
  if (colors.has("C")) return "mana-symbol-c"
  if (colors.has("S")) return "mana-symbol-s"
  return "mana-symbol-generic"
}

function renderToken(rawToken: string, idx: number, symbolClassName?: string) {
  const token = rawToken.toUpperCase()
  const compact = token.replace("/", "")
  const display = token === "T" ? "T" : token === "Q" ? "Q" : token === "E" ? "E" : compact

  return (
    <span
      key={`mana-${idx}`}
      className={`mana-symbol ${symbolTone(token)} ${symbolClassName ?? ""}`}
      aria-label={tokenLabel(token)}
      title={`{${rawToken}}`}
    >
      {display}
    </span>
  )
}

export function ManaText({ text, className, symbolClassName }: ManaTextProps) {
  if (!text) return null

  const parts: ReactNode[] = []
  const re = /\{([^}]+)\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(renderToken(match[1], idx, symbolClassName))
    idx += 1
    lastIndex = re.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <span className={className}>{parts}</span>
}
