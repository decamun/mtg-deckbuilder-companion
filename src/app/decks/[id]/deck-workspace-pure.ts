import type { DeckCard, GroupingMode, SortingMode } from "@/lib/types"
import { getCardTypeGroup, typeGroupSectionSortMeta } from "@/lib/card-types"
import { RARITY_SORT_RANK, TAG_GROUP_UNTAGGED } from "./deck-workspace-constants"
import type { DeckCardRow } from "./deck-workspace-types"

export function raritySortKey(rarity: string | undefined): number {
  if (!rarity) return 1_000
  const rank = RARITY_SORT_RANK[rarity.toLowerCase()]
  return rank !== undefined ? rank : 100
}

export function compareDeckCardsBySort(a: DeckCard, b: DeckCard, sorting: SortingMode): number {
  let cmp = 0
  if (sorting === "name") {
    cmp = a.name.localeCompare(b.name)
  } else if (sorting === "mana") {
    cmp = (a.cmc || 0) - (b.cmc || 0)
    if (cmp === 0) cmp = (a.mana_cost ?? "").localeCompare(b.mana_cost ?? "")
  } else if (sorting === "price") {
    const pa = a.price_usd
    const pb = b.price_usd
    if (pa == null && pb == null) cmp = 0
    else if (pa == null) cmp = 1
    else if (pb == null) cmp = -1
    else cmp = pa - pb
  } else if (sorting === "rarity") {
    cmp = raritySortKey(a.rarity) - raritySortKey(b.rarity)
  }
  if (cmp !== 0) return cmp
  return a.name.localeCompare(b.name)
}

export function normalizeTagForStorage(raw: string): string {
  const lower = raw.trim().toLowerCase()
  if (!lower) return ""
  return lower.replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function tagGroupHeading(lowerKey: string): string {
  if (lowerKey === TAG_GROUP_UNTAGGED) return "Untagged"
  return normalizeTagForStorage(lowerKey)
}

export function groupSectionHeading(groupKey: string, grouping: GroupingMode): string {
  if (grouping === "tag") return tagGroupHeading(groupKey)
  if (grouping === "mana") {
    const m = /^mana value\s+(.*)$/i.exec(groupKey.trim())
    if (m) return `Mana Value ${m[1]}`
  }
  return groupKey
}

export function compareTypeGroupSectionKeys(a: string, b: string): number {
  const ma = typeGroupSectionSortMeta(a)
  const mb = typeGroupSectionSortMeta(b)
  if (ma.tier !== mb.tier) return ma.tier - mb.tier
  return ma.name.localeCompare(mb.name)
}

export const defaultPrimerSeed = (deckName: string) =>
  `# ${deckName}

Welcome to the primer for **${deckName}**.

## Game Plan
- _Describe the high-level strategy here._

## Key Cards
- _List your engine pieces and why they matter._

## Mulligans
- _What does an ideal opening hand look like?_
`

export function visualDeckCardChrome(
  card: DeckCard,
  opts: {
    commanderIds: readonly string[]
    coverImageId: string | null
    violations: readonly string[] | undefined
  }
): string {
  if (opts.violations && opts.violations.length > 0) {
    return "border-red-500/85 ring-2 ring-red-500/45 hover:border-red-400"
  }
  if (opts.commanderIds.includes(card.scryfall_id)) {
    return "border-yellow-400/80 ring-2 ring-yellow-400/40 hover:border-yellow-300"
  }
  if (opts.coverImageId === card.scryfall_id) {
    return "border-blue-400/80 ring-2 ring-blue-400/40 hover:border-blue-300"
  }
  return "border-border hover:border-primary/50"
}

/** Tag view lists the same deck row in multiple sections; @dnd-kit requires a unique id per draggable node. */
export function deckCardDragId(grouping: GroupingMode, groupName: string, cardId: string): string {
  if (grouping === "tag") {
    return JSON.stringify({ __tagSlot: true as const, group: groupName, cardId })
  }
  return cardId
}

export function parseDeckCardDragId(rawId: string, grouping: GroupingMode): string {
  if (grouping !== "tag") return rawId
  try {
    const parsed = JSON.parse(rawId) as { __tagSlot?: boolean; cardId?: string }
    if (parsed?.__tagSlot && typeof parsed.cardId === "string") return parsed.cardId
  } catch {
    /* legacy plain uuid */
  }
  return rawId
}

export function mergeDeckCardRow(current: DeckCard, row: DeckCardRow): DeckCard {
  return {
    ...current,
    ...row,
    image_url: current.image_url,
    face_images: current.face_images,
    type_line: current.type_line,
    mana_cost: current.mana_cost,
    oracle_text: current.oracle_text,
    cmc: current.cmc,
    colors: current.colors,
    color_identity: current.color_identity,
    legalities: current.legalities,
    produced_mana: current.produced_mana,
    set_code: current.set_code,
    collector_number: current.collector_number,
    available_finishes: current.available_finishes,
    price_usd: current.price_usd,
    rarity: current.rarity,
    effective_printing_id: current.effective_printing_id,
  }
}

export function groupDeckCards(
  displayedCards: DeckCard[],
  grouping: GroupingMode,
  sorting: SortingMode
): Record<string, DeckCard[]> {
  const sorted = [...displayedCards].sort((a, b) => compareDeckCardsBySort(a, b, sorting))

  if (grouping === "none") return { "All Cards": sorted }

  const groups: Record<string, DeckCard[]> = {}

  if (grouping === "tag") {
    sorted.forEach((c) => {
      if (!c.tags || c.tags.length === 0) {
        if (!groups[TAG_GROUP_UNTAGGED]) groups[TAG_GROUP_UNTAGGED] = []
        groups[TAG_GROUP_UNTAGGED].push(c)
      } else {
        const seen = new Set<string>()
        for (const tag of c.tags) {
          const k = tag.trim().toLowerCase()
          if (!k || seen.has(k)) continue
          seen.add(k)
          if (!groups[k]) groups[k] = []
          groups[k].push(c)
        }
      }
    })
    return groups
  }

  sorted.forEach((c) => {
    let key = "Other"
    if (grouping === "type") {
      key = getCardTypeGroup(c.type_line)
    } else if (grouping === "mana") {
      key = `Mana Value ${c.cmc || 0}`
    }
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  })
  return groups
}

/** Group label for a card — matches list view sections so ⋮ menu tag actions stay coherent. */
export function editorGroupNameForCard(c: DeckCard, grouping: GroupingMode): string {
  if (grouping === "none") return "All Cards"
  if (grouping === "type") return getCardTypeGroup(c.type_line)
  if (grouping === "mana") return `Mana Value ${c.cmc || 0}`
  if (grouping === "tag") {
    if (!c.tags?.length) return TAG_GROUP_UNTAGGED
    const keys = [...new Set((c.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )
    return keys[0] ?? TAG_GROUP_UNTAGGED
  }
  return "All Cards"
}

export function primaryDeckCardImage(card: DeckCard): string | undefined {
  return card.face_images?.[0]?.normal ?? card.face_images?.[0]?.small ?? card.image_url
}
