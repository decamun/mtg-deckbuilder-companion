"use client"

/* eslint-disable react-hooks/refs -- searchContainerRef is attached to the add-cards popover root */

import { LayoutGrid, List, Layers as StackIcon, PlusCircle, Search } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { GroupingMode, SortingMode, ViewMode } from "@/lib/types"
import type { DeckFormatValidationStatus } from "@/lib/deck-format-validation"
import type { ScryfallCard } from "@/lib/scryfall"
import { getCardImageUrl } from "@/lib/scryfall"
import { MIN_CARD_SIZE, MAX_CARD_SIZE } from "./deck-workspace-constants"
import { getZonesForFormat } from "@/lib/zones"
import { cn } from "@/lib/utils"
import { ManaText } from "@/components/mana/ManaText"

export type DeckWorkspaceDecklistToolbarProps = {
  cardSize: number
  grouping: GroupingMode
  sorting: SortingMode
  viewMode: ViewMode
  displayedFormat: string | null
  formatValidationStatus: DeckFormatValidationStatus
  formatDeckViolations: readonly string[]
  formatViolationCount: number
  activeZone: string
  customZoneIds: string[]
  onCardSizeChange: (n: number) => void
  onGroupingChange: (g: GroupingMode) => void
  onSortingChange: (s: SortingMode) => void
  onViewModeChange: (v: ViewMode) => void
  onOpenFormatHints: () => void
  onZoneChange: (zone: string) => void
  /** Add-cards search (decklist, owner, not viewing a version). */
  showAddCards?: boolean
  addCardsOpen?: boolean
  onAddCardsOpenChange?: (open: boolean) => void
  query?: string
  results?: ScryfallCard[]
  selectedResultIdx?: number
  searchContainerRef?: React.RefObject<HTMLDivElement | null>
  onQueryChange?: (v: string) => void
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSearchResultHover?: (idx: number) => void
  onSearchResultRulesHover?: (card: ScryfallCard | null) => void
  onAddCard?: (card: ScryfallCard) => void
}

/**
 * Overflow: below `md`, controls stack with full-width selects instead of one crowded `flex-wrap` row;
 * from `md` up, controls stay on one wrapping row (issue #226).
 */
export function DeckWorkspaceDecklistToolbar(props: DeckWorkspaceDecklistToolbarProps) {
  const zones = getZonesForFormat(props.displayedFormat, props.customZoneIds)
  const showAddCards = props.showAddCards && props.onAddCard && props.searchContainerRef

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Tabs
          value={props.viewMode}
          onValueChange={(v) => props.onViewModeChange(v as ViewMode)}
          className="rounded-md border border-border bg-card p-0.5"
        >
          <TabsList className="h-7 bg-transparent">
            <TabsTrigger
              value="visual"
              className="h-6 px-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="stack"
              className="h-6 px-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              <StackIcon className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="list"
              className="h-6 px-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              <List className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground md:max-w-none md:flex-none">
          <span className="shrink-0">Card size</span>
          <input
            type="range"
            min={MIN_CARD_SIZE}
            max={MAX_CARD_SIZE}
            step={4}
            value={props.cardSize}
            onChange={(e) => props.onCardSizeChange(Number(e.target.value))}
            className="min-w-0 flex-1 accent-primary md:w-28 md:flex-none"
          />
          <span className="w-8 shrink-0 text-right font-mono text-[11px]">{props.cardSize}</span>
        </label>
        </div>
        {showAddCards && (
          <div
            ref={props.searchContainerRef}
            className="relative w-full min-w-0 shrink-0 sm:w-auto sm:max-w-[min(100%,20rem)]"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 w-full justify-start gap-2 border-border bg-card text-foreground sm:w-auto sm:justify-center",
                props.addCardsOpen && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              onClick={() => {
                props.onAddCardsOpenChange?.(!props.addCardsOpen)
              }}
              aria-expanded={props.addCardsOpen}
              aria-controls="deck-add-cards-panel"
            >
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
              Add cards
            </Button>
            {props.addCardsOpen && (
              <div
                id="deck-add-cards-panel"
                className="absolute left-0 right-0 top-full z-50 mt-1 min-w-[min(100vw-2rem,22rem)] max-w-[min(100vw-2rem,28rem)] rounded-lg border border-border bg-card p-2 shadow-2xl sm:left-auto sm:right-0 sm:min-w-[22rem]"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search to add…"
                    className="h-8 w-full min-w-0 border-border bg-background/80 pl-9 pr-4 text-sm text-foreground"
                    value={props.query ?? ""}
                    onChange={(e) => props.onQueryChange?.(e.target.value)}
                    onKeyDown={props.onSearchKeyDown}
                    autoFocus
                  />
                </div>
                {props.addCardsOpen && (props.results?.length ?? 0) > 0 && (
                  <div
                    className="mt-2 overflow-hidden rounded-md border border-border bg-card"
                    onMouseLeave={() => props.onSearchResultRulesHover?.(null)}
                  >
                    <div className="max-h-80 overflow-y-auto">
                      {(props.results ?? []).slice(0, 10).map((card, idx) => (
                        <div
                          key={card.id}
                          className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                            idx === (props.selectedResultIdx ?? 0) ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                          }`}
                          onMouseEnter={() => {
                            props.onSearchResultHover?.(idx)
                            props.onSearchResultRulesHover?.(card)
                          }}
                          onClick={() => props.onAddCard?.(card)}
                        >
                          {getCardImageUrl(card, "small") && (
                            <img src={getCardImageUrl(card, "small")} alt="" className="h-auto w-7 shrink-0 rounded" draggable={false} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{card.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{card.type_line}</div>
                          </div>
                          <ManaText text={card.mana_cost} className="ml-2 shrink-0 text-xs text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 md:flex md:flex-wrap md:gap-2">
        <Select value={props.grouping} onValueChange={(v) => props.onGroupingChange(v as GroupingMode)}>
          <SelectTrigger className="h-8 w-full min-w-0 border-border bg-card text-foreground md:w-32">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="type">By Type</SelectItem>
            <SelectItem value="mana">By Mana Cost</SelectItem>
            <SelectItem value="tag">By Tags</SelectItem>
          </SelectContent>
        </Select>
        <Select value={props.sorting} onValueChange={(v) => props.onSortingChange(v as SortingMode)}>
          <SelectTrigger className="h-8 w-full min-w-0 border-border bg-card text-foreground md:w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="mana">Mana cost</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="rarity">Rarity</SelectItem>
          </SelectContent>
        </Select>
        {zones.length > 1 && (
          <Select value={props.activeZone} onValueChange={(v) => v && props.onZoneChange(v)}>
            <SelectTrigger className="h-8 w-full min-w-0 border-border bg-card text-foreground md:w-36">
              <SelectValue placeholder="Board" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {props.formatDeckViolations.length > 0 && (
        <div
          className={cn(
            "w-full min-w-0 text-xs leading-snug md:max-w-[22rem]",
            props.formatValidationStatus === "implemented"
              ? "text-red-400/90"
              : "text-muted-foreground"
          )}
        >
          {props.formatDeckViolations.map((msg, index) => (
            <p key={index}>{msg}</p>
          ))}
        </div>
      )}
      {(props.formatValidationStatus === "implemented" ||
        props.formatValidationStatus === "not_yet_implemented") &&
        (props.formatViolationCount > 0 || props.formatDeckViolations.length > 0) && (
          <button
            type="button"
            onClick={() => props.onOpenFormatHints()}
            className={cn(
              "w-full max-w-full cursor-pointer rounded px-0.5 text-left text-xs leading-snug hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 md:max-w-[16rem]",
              props.formatValidationStatus === "implemented"
                ? "text-red-400/90 focus-visible:ring-red-400/50"
                : "text-muted-foreground focus-visible:ring-muted-foreground/40"
            )}
            title={
              props.formatViolationCount > 0
                ? "Show cards with format hints and deck-level messages"
                : "Show deck-level format messages"
            }
          >
            {(() => {
              const parts: string[] = []
              if (props.formatViolationCount > 0) {
                parts.push(
                  `${props.formatViolationCount} card${props.formatViolationCount === 1 ? "" : "s"}`
                )
              }
              if (props.formatDeckViolations.length > 0) {
                parts.push("deck rules")
              }
              return `Format hints · ${parts.join(" · ")} (${props.displayedFormat === "edh" ? "EDH" : props.displayedFormat ?? "format"})`
            })()}
          </button>
        )}
    </div>
  )
}
