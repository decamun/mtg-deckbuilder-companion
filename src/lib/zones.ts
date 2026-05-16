/**
 * Zone Registry — canonical list of deck zones (boards).
 *
 * Each zone has a stable `id` (the value stored in `deck_cards.zone`),
 * a display label, and flags that control how it participates in deck
 * construction rules.
 *
 * Adding a new zone type requires only:
 *   1. A new entry here (+ a DB migration backfilling existing rows if needed)
 *   2. Format-validation branches for any size limits
 *
 * No string literals for zone values should appear outside this file and
 * the migration that defines them.
 */

/** Canonical zone id stored in `deck_cards.zone` for the primary deck. */
export const MAINBOARD_ZONE_ID = 'mainboard' as const

/** Canonical zone id for the sideboard (when the format uses one). */
export const SIDEBOARD_ZONE_ID = 'sideboard' as const

/** Canonical zone id for cards under consideration (excluded from legality counts). */
export const MAYBEBOARD_ZONE_ID = 'maybeboard' as const

/** Commander / partner cards (Commander-format decks). Excluded from main-deck totals. */
export const COMMANDER_ZONE_ID = 'commander' as const

/**
 * Fallback when `zone` is null, undefined, or blank — matches the DB default
 * on `deck_cards.zone`.
 */
export const DEFAULT_CARD_ZONE_ID = MAINBOARD_ZONE_ID

export interface ZoneDefinition {
  /** Value stored in `deck_cards.zone`. */
  id: string
  /** Human-readable label shown in the UI. */
  label: string
  /** If true, cards in this zone count toward the main deck size / legality checks. */
  countsTowardMainDeck: boolean
  /** If true, this zone participates in format validation (e.g. sideboard size). */
  isFormatValidated: boolean
  /** Display sort order. */
  sortOrder: number
  /**
   * Formats that include this zone as a locked, format-specific board.
   * `null` means "all formats". Only used for implicit board inclusion logic;
   * the zone can still be used in any deck.
   */
  formatIds: string[] | null
  /** If true, this zone cannot be removed from the deck by the user. */
  locked: boolean
  /**
   * If true, this zone is automatically present in every deck (even if empty).
   * Locked zones are always default.
   */
  isDefault: boolean
  /** Optional max cards hint per zone (null = unlimited). */
  maxCards: number | null
}

/**
 * Formats that include a sideboard in their deck construction rules.
 * This list is used to lock the sideboard board for those formats.
 */
export const SIDEBOARD_FORMATS = [
  'standard',
  'alchemy',
  'explorer',
  'historic',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'brawl',
  'standardbrawl',
  'timeless',
]

export const ZONE_REGISTRY: ZoneDefinition[] = [
  {
    id: MAINBOARD_ZONE_ID,
    label: 'Mainboard',
    countsTowardMainDeck: true,
    isFormatValidated: true,
    sortOrder: 0,
    formatIds: null,
    locked: true,
    isDefault: true,
    maxCards: null,
  },
  {
    id: COMMANDER_ZONE_ID,
    label: 'Commander',
    countsTowardMainDeck: false,
    isFormatValidated: false,
    sortOrder: 1,
    formatIds: ['edh', 'commander'],
    locked: true,
    isDefault: false,
    maxCards: 2,
  },
  {
    id: SIDEBOARD_ZONE_ID,
    label: 'Sideboard',
    countsTowardMainDeck: false,
    isFormatValidated: true,
    sortOrder: 2,
    formatIds: SIDEBOARD_FORMATS,
    /**
     * `locked: false` means the sideboard is user-removable in formats that do NOT
     * use a sideboard (e.g. EDH/Commander). For formats listed in `formatIds`,
     * `isZoneLockedForFormat()` returns true, effectively locking the board.
     */
    locked: false,
    isDefault: false,
    maxCards: 15,
  },
  {
    id: MAYBEBOARD_ZONE_ID,
    label: 'Maybeboard',
    countsTowardMainDeck: false,
    isFormatValidated: false,
    sortOrder: 3,
    formatIds: null,
    locked: false,
    isDefault: true,
    maxCards: null,
  },
]

/** Map from zone id → ZoneDefinition for fast lookup. */
export const ZONE_BY_ID: ReadonlyMap<string, ZoneDefinition> = new Map(
  ZONE_REGISTRY.map((z) => [z.id, z])
)

/** Get the display label for a zone id (falls back to the id itself for custom zones). */
export function getZoneLabel(id: string): string {
  return ZONE_BY_ID.get(id)?.label ?? capitalize(id)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Return the ordered list of zones that should be shown for a given format.
 * Always includes: mainboard + maybeboard (default zones).
 * Includes commander (EDH) and sideboard when the format calls for them.
 * Custom zones (ids not in the registry) are appended at the end.
 */
export function getZonesForFormat(
  format: string | null | undefined,
  customZoneIds: string[] = []
): ZoneDefinition[] {
  const normalizedFormat = format?.trim().toLowerCase() ?? null

  const baseZones = ZONE_REGISTRY.filter((z) => {
    if (z.isDefault) return true
    if (!z.formatIds) return true
    if (normalizedFormat && z.formatIds.includes(normalizedFormat)) return true
    return false
  })

  const customDefs: ZoneDefinition[] = customZoneIds
    .filter((id) => !ZONE_BY_ID.has(id))
    .map((id, i) => ({
      id,
      label: capitalize(id),
      countsTowardMainDeck: false,
      isFormatValidated: false,
      sortOrder: 100 + i,
      formatIds: null,
      locked: false,
      isDefault: false,
      maxCards: null,
    }))

  return [...baseZones, ...customDefs]
}

/**
 * Whether a zone should be locked (non-removable) for a given format.
 * Mainboard is always locked. Sideboard is locked for formats that use it.
 */
export function isZoneLockedForFormat(
  zoneId: string,
  format: string | null | undefined
): boolean {
  const def = ZONE_BY_ID.get(zoneId)
  if (!def) return false
  if (def.locked) return true
  if (!def.formatIds) return false
  const normalizedFormat = format?.trim().toLowerCase() ?? null
  return !!normalizedFormat && def.formatIds.includes(normalizedFormat)
}

/** Set of all zone ids defined in the registry. Used to distinguish custom zones from canonical ones. */
export const REGISTRY_ZONE_IDS: ReadonlySet<string> = new Set(ZONE_REGISTRY.map((z) => z.id))

/** Normalize a stored zone value for comparisons (empty → {@link DEFAULT_CARD_ZONE_ID}). */
export function normalizeCardZone(zone: string | null | undefined): string {
  const t = zone?.trim()
  return t || DEFAULT_CARD_ZONE_ID
}

/**
 * True when this zone participates in "main deck" analytics and export sections
 * (see {@link ZoneDefinition.countsTowardMainDeck}). Unknown / custom zones are false.
 */
export function zoneCountsTowardMainDeck(zone: string | null | undefined): boolean {
  const z = normalizeCardZone(zone)
  return ZONE_BY_ID.get(z)?.countsTowardMainDeck === true
}

export function isSideboardZone(zone: string | null | undefined): boolean {
  return normalizeCardZone(zone) === SIDEBOARD_ZONE_ID
}

export function isMaybeboardZone(zone: string | null | undefined): boolean {
  return normalizeCardZone(zone) === MAYBEBOARD_ZONE_ID
}

export function isCommanderZone(zone: string | null | undefined): boolean {
  return normalizeCardZone(zone) === COMMANDER_ZONE_ID
}

/**
 * Sanitize a user-provided board name into a valid zone id.
 * Returns `null` if the resulting id is empty or conflicts with a reserved zone id.
 *
 * Rules:
 *   - Lowercase, trim
 *   - Replace non-alphanumeric characters (except hyphens) with hyphens
 *   - Collapse consecutive hyphens; strip leading/trailing hyphens
 */
export function sanitizeCustomZoneId(raw: string): string | null {
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  if (!id) return null
  if (REGISTRY_ZONE_IDS.has(id)) return null
  return id
}

/** Reason a custom zone id is invalid, for user-facing error messages. */
export type CustomZoneIdError = "empty" | "reserved"

/**
 * Validate a user-provided board name without sanitizing.
 * Returns `null` if valid, or a {@link CustomZoneIdError} describing why it's invalid.
 */
export function validateCustomZoneName(raw: string): CustomZoneIdError | null {
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  if (!id) return "empty"
  if (REGISTRY_ZONE_IDS.has(id)) return "reserved"
  return null
}
