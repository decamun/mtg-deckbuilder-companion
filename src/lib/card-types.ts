/**
 * Shared card-type helpers used across the deck editor, diff view, and analytics.
 *
 * MTG card types supported:
 *   Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, Land
 *
 * Split / adventure cards have type lines like "Instant // Sorcery" or
 * "Creature — Human Peasant // Instant — Adventure". We classify by the
 * primary (left-hand) face only so that e.g. an adventure creature stays in
 * the Creature group.
 */

/**
 * Priority-ordered list of canonical MTG card type groups.
 *
 * Order matters: the first matching type wins.  Creature is listed before
 * Artifact and Enchantment so that multi-type cards (e.g. "Artifact Creature"
 * or "Enchantment Creature") are always grouped under Creature, which matches
 * the expectation in every deck-management UI.
 */
export const CARD_TYPE_GROUPS = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
] as const

export type CardTypeGroup = typeof CARD_TYPE_GROUPS[number] | 'Other'

/**
 * Returns the type line of the primary face only.
 * For split / adventure cards ("Instant // Sorcery"), strips everything from
 * " // " onward so grouping is driven by the first face.
 */
export function primaryTypeLine(typeLine: string | undefined): string {
  if (!typeLine) return ''
  const sepIdx = typeLine.indexOf(' // ')
  return sepIdx === -1 ? typeLine : typeLine.slice(0, sepIdx)
}

/**
 * Maps a card's type_line to one of the canonical type groups.
 * Uses the primary face for split / adventure cards.
 * Falls back to 'Other' when no known type is present.
 */
export function getCardTypeGroup(typeLine: string | undefined): CardTypeGroup {
  const primary = primaryTypeLine(typeLine)
  for (const t of CARD_TYPE_GROUPS) {
    if (primary.includes(t)) return t
  }
  return 'Other'
}
