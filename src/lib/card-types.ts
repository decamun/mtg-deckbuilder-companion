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

/** Type lines for each face, split on MDFC / adventure / split delimiter. */
export function typeLineFaces(typeLine: string | undefined): string[] {
  if (!typeLine) return []
  return typeLine.split(/\s*\/\/\s*/).map(s => s.trim()).filter(Boolean)
}

/**
 * True if any face's type line contains Land as a card type word.
 * Used for land counts that include MDFC backs (e.g. creature // land).
 */
export function hasLandFaceOnTypeLine(typeLine: string | undefined): boolean {
  for (const face of typeLineFaces(typeLine)) {
    if (/\bLand\b/.test(face)) return true
  }
  return false
}

const NONLAND_PERMANENT_TYPES = new Set<string>([
  'Creature',
  'Planeswalker',
  'Battle',
  'Artifact',
  'Enchantment',
])

const NONLAND_NONPERMANENT_TYPES = new Set<string>(['Instant', 'Sorcery'])

/**
 * Sort key for deck type sections: nonland permanents (A–Z), then nonland
 * nonpermanents (A–Z), then Other, then Land.
 */
export function typeGroupSectionSortMeta(group: CardTypeGroup | string): { tier: number; name: string } {
  const g = String(group)
  if (g === 'Land') return { tier: 3, name: g }
  if (g === 'Other') return { tier: 2, name: g }
  if (NONLAND_NONPERMANENT_TYPES.has(g)) return { tier: 1, name: g }
  if (NONLAND_PERMANENT_TYPES.has(g)) return { tier: 0, name: g }
  return { tier: 2, name: g }
}
