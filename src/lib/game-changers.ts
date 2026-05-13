/**
 * EDH bracket game-changer list and per-bracket caps.
 * Source: WotC published EDH bracket system. Update this file when WotC revises
 * the list. Names are stored lowercased for case-insensitive lookup.
 */

/**
 * Update when the fallback WotC bracket list is refreshed.
 * This is consumed by format-validation cache keys.
 */
export const GAME_CHANGER_DATA_VERSION = 'wotc-edh-brackets-fallback-v1'

const NAMES = [
  "Ad Nauseam",
  "Ancient Tomb",
  "Bolas's Citadel",
  "Chrome Mox",
  "Coalition Victory",
  "Crop Rotation",
  "Demonic Tutor",
  "Drannith Magistrate",
  "Enlightened Tutor",
  "Field of the Dead",
  "Force of Will",
  "Gaea's Cradle",
  "Glacial Chasm",
  "Grim Monolith",
  "Grim Tutor",
  "Humility",
  "Imperial Seal",
  "Intuition",
  "Jeska's Will",
  "Jeweled Lotus",
  "Kinnan, Bonder Prodigy",
  "Mana Drain",
  "Mana Vault",
  "Mox Diamond",
  "Mystical Tutor",
  "Natural Order",
  "Necropotence",
  "Notion Thief",
  "Opposition Agent",
  "Orcish Bowmasters",
  "Panoptic Mirror",
  "Paradox Engine",
  "Razaketh, the Foulblooded",
  "Rhystic Study",
  "Seedborn Muse",
  "Serra's Sanctum",
  "Smothering Tithe",
  "Survival of the Fittest",
  "Tergrid, God of Fright",
  "Thassa's Oracle",
  "The One Ring",
  "The Tabernacle at Pendrell Vale",
  "Trinisphere",
  "Urza, Lord High Artificer",
  "Vampiric Tutor",
  "Winota, Joiner of Forces",
  "Yuriko, the Tiger's Shadow",
]

export const GAME_CHANGERS: ReadonlySet<string> = new Set(
  NAMES.map((n) => n.toLowerCase())
)

if (GAME_CHANGERS.size === 0) {
  throw new Error('Commander game-changer list is empty: refusing to start with invalid legality data.')
}

export type Bracket = 1 | 2 | 3 | 4 | 5

export const BRACKET_GC_LIMIT: Record<Bracket, number> = {
  1: 0,
  2: 0,
  3: 3,
  4: Infinity,
  5: Infinity,
}

export const BRACKET_LABELS: Record<Bracket, string> = {
  1: "Exhibition",
  2: "Core",
  3: "Upgraded",
  4: "Optimized",
  5: "cEDH",
}

export function bracketHelperText(bracket: Bracket): string {
  const cap = BRACKET_GC_LIMIT[bracket]
  if (cap === 0) return "no game changers"
  if (!isFinite(cap)) return "unlimited game changers"
  return `max ${cap} game changers`
}

export function isGameChanger(name: string): boolean {
  return GAME_CHANGERS.has(name.toLowerCase())
}
