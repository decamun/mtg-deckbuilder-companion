// Stack card width is w-44 (176px); height ≈ 176 * 1.4 = 246px
export const DEFAULT_CARD_SIZE = 176
export const MIN_CARD_SIZE = 132
export const MAX_CARD_SIZE = 240
export const STACK_PEEK_RATIO = 32 / DEFAULT_CARD_SIZE
export const STACK_EXTRA_PEEK_RATIO = 14 / DEFAULT_CARD_SIZE
export const STACK_CARD_HEIGHT_RATIO = 246 / DEFAULT_CARD_SIZE
export const STACK_HOVER_SHIFT_RATIO = 44 / DEFAULT_CARD_SIZE
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
