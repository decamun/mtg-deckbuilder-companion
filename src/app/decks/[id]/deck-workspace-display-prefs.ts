import type { GroupingMode, SortingMode, ViewMode } from "@/lib/types"
import { DEFAULT_CARD_SIZE, MAX_CARD_SIZE, MIN_CARD_SIZE } from "./deck-workspace-constants"

const STORAGE_KEY = "deck-workspace-display-prefs:v1"

const GROUPING_MODES: readonly GroupingMode[] = ["none", "type", "mana", "tag"]
const SORTING_MODES: readonly SortingMode[] = ["mana", "name", "price", "rarity"]
const VIEW_MODES: readonly ViewMode[] = ["list", "stack", "visual"]

export type DeckWorkspaceDisplayPrefs = {
  viewMode: ViewMode
  grouping: GroupingMode
  sorting: SortingMode
  cardSize: number
}

export const DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS: DeckWorkspaceDisplayPrefs = {
  viewMode: "list",
  grouping: "type",
  sorting: "mana",
  cardSize: DEFAULT_CARD_SIZE,
}

function isGroupingMode(v: unknown): v is GroupingMode {
  return typeof v === "string" && (GROUPING_MODES as readonly string[]).includes(v)
}

function isSortingMode(v: unknown): v is SortingMode {
  return typeof v === "string" && (SORTING_MODES as readonly string[]).includes(v)
}

function isViewMode(v: unknown): v is ViewMode {
  return typeof v === "string" && (VIEW_MODES as readonly string[]).includes(v)
}

function clampCardSize(n: unknown): number {
  const raw = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN
  if (!Number.isFinite(raw)) return DEFAULT_CARD_SIZE
  const stepped = Math.round(raw / 4) * 4
  return Math.min(MAX_CARD_SIZE, Math.max(MIN_CARD_SIZE, stepped))
}

export function loadDeckWorkspaceDisplayPrefs(): DeckWorkspaceDisplayPrefs {
  if (typeof window === "undefined") return DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS.viewMode,
      grouping: isGroupingMode(parsed.grouping) ? parsed.grouping : DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS.grouping,
      sorting: isSortingMode(parsed.sorting) ? parsed.sorting : DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS.sorting,
      cardSize: clampCardSize(parsed.cardSize),
    }
  } catch {
    return DEFAULT_DECK_WORKSPACE_DISPLAY_PREFS
  }
}

export function saveDeckWorkspaceDisplayPrefs(prefs: DeckWorkspaceDisplayPrefs): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        viewMode: prefs.viewMode,
        grouping: prefs.grouping,
        sorting: prefs.sorting,
        cardSize: clampCardSize(prefs.cardSize),
      })
    )
  } catch {
    // ignore quota / private mode
  }
}
