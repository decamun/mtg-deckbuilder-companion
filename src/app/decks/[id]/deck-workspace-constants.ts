/** Initial deck-editor card width slider (px). */
export const DEFAULT_CARD_SIZE = 160
export const MIN_CARD_SIZE = 132
export const MAX_CARD_SIZE = 240

/** Layout baseline (w-44); stack/spacing ratios stay tied to this so changing the default width does not skew other slider values. */
const REFERENCE_CARD_WIDTH = 176
export const STACK_PEEK_RATIO = 32 / REFERENCE_CARD_WIDTH
export const STACK_EXTRA_PEEK_RATIO = 14 / REFERENCE_CARD_WIDTH
export const STACK_CARD_HEIGHT_RATIO = 246 / REFERENCE_CARD_WIDTH
export const STACK_HOVER_SHIFT_RATIO = 44 / REFERENCE_CARD_WIDTH
export const CARD_INTERACTION_SETTLE_MS = 250

export const DEFAULT_TAGS = ["card advantage", "interaction", "wincon", "combo piece"]

/** Internal map key for the untagged bucket when grouping by tag. */
export const TAG_GROUP_UNTAGGED = "untagged"

/** Ascending: common → mythic; Scryfall `special` / `bonus` after mythic; unknown last. */
export const RARITY_SORT_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
  special: 4,
  bonus: 5,
}
