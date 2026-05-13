"use client"

import { LayoutGrid, List, Layers as StackIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GroupingMode, SortingMode, ViewMode } from "@/lib/types"
import type { DeckFormatValidationStatus } from "@/lib/deck-format-validation"
import { MIN_CARD_SIZE, MAX_CARD_SIZE } from "./deck-workspace-constants"

export type DeckWorkspaceDecklistToolbarProps = {
  cardSize: number
  grouping: GroupingMode
  sorting: SortingMode
  viewMode: ViewMode
  displayedFormat: string | null
  formatValidationStatus: DeckFormatValidationStatus
  formatDeckViolations: readonly string[]
  formatViolationCount: number
  onCardSizeChange: (n: number) => void
  onGroupingChange: (g: GroupingMode) => void
  onSortingChange: (s: SortingMode) => void
  onViewModeChange: (v: ViewMode) => void
  onOpenFormatHints: () => void
}

export function DeckWorkspaceDecklistToolbar(props: DeckWorkspaceDecklistToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground">
        Card size
        <input
          type="range"
          min={MIN_CARD_SIZE}
          max={MAX_CARD_SIZE}
          step={4}
          value={props.cardSize}
          onChange={(e) => props.onCardSizeChange(Number(e.target.value))}
          className="w-28 accent-primary"
        />
        <span className="w-8 text-right font-mono text-[11px]">{props.cardSize}</span>
      </label>
      <Select value={props.grouping} onValueChange={(v) => props.onGroupingChange(v as GroupingMode)}>
        <SelectTrigger className="w-32 bg-card border-border h-8 text-foreground">
          <SelectValue placeholder="Group by" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border text-foreground">
          <SelectItem value="none">No Grouping</SelectItem>
          <SelectItem value="type">By Type</SelectItem>
          <SelectItem value="mana">By Mana Cost</SelectItem>
          <SelectItem value="tag">By Tags</SelectItem>
        </SelectContent>
      </Select>
      <Select value={props.sorting} onValueChange={(v) => props.onSortingChange(v as SortingMode)}>
        <SelectTrigger className="w-40 bg-card border-border h-8 text-foreground">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border text-foreground">
          <SelectItem value="mana">Mana cost</SelectItem>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="price">Price</SelectItem>
          <SelectItem value="rarity">Rarity</SelectItem>
        </SelectContent>
      </Select>
      <Tabs value={props.viewMode} onValueChange={(v) => props.onViewModeChange(v as ViewMode)} className="bg-card rounded-md p-0.5 border border-border">
        <TabsList className="h-7 bg-transparent">
          <TabsTrigger value="visual" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <LayoutGrid className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="stack" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <StackIcon className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="list" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <List className="w-3.5 h-3.5" />
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {props.formatValidationStatus === 'not_yet_implemented' && props.formatDeckViolations.length > 0 && (
        <p className="max-w-[18rem] text-xs leading-snug text-muted-foreground">{props.formatDeckViolations[0]}</p>
      )}
      {props.formatViolationCount > 0 && props.formatValidationStatus === 'implemented' && (
        <button
          type="button"
          onClick={() => props.onOpenFormatHints()}
          className="max-w-[14rem] cursor-pointer rounded px-0.5 text-left text-xs leading-snug text-red-400/90 hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
          title="Show cards with format hints"
        >
          Format hints · {props.formatViolationCount} card{props.formatViolationCount === 1 ? "" : "s"} (
          {props.displayedFormat === "edh" ? "EDH" : props.displayedFormat ?? "format"})
        </button>
      )}
    </div>
  )
}
