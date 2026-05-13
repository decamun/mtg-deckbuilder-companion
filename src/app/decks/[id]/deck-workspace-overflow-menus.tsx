"use client"

import { MoreVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DeckCard, GroupingMode } from "@/lib/types"
import type { ScryfallPrinting } from "@/lib/scryfall"
import type { MutableRefObject } from "react"
import { DeckWorkspaceCardActionMenuItems } from "./deck-workspace-card-action-menu-items"

function stampPortaledMenuCloseGuard(ref: MutableRefObject<number>) {
  ref.current = performance.now()
}

export type DeckWorkspaceOverflowMenusProps = {
  isOwner: boolean
  viewing: boolean
  grouping: GroupingMode
  commanderIds: string[]
  coverImageId: string | null
  allUniqueTags: string[]
  printingsByCard: Record<string, ScryfallPrinting[]>
  formatHintsMenuClosedAtRef: MutableRefObject<number>
  displayedFormat: string | null
  customZoneIds: string[]
  ensurePrintingsLoaded: (card: DeckCard) => void
  onSetCommander: (scryfallId: string) => void
  onSetCoverImage: (scryfallId: string) => void
  onSetCardPrinting: (cardId: string, printingId: string | null) => void
  onSetCardFinish: (cardId: string, finish: "nonfoil" | "foil" | "etched") => void
  onAddTag: (cardId: string, tag: string) => void
  onRemoveTag: (cardId: string, tag: string) => void
  onOpenCustomTagDialog: (cardId: string) => void
  onMoveToZone: (cardId: string, zone: string) => void
  onOpenCustomBoardDialog: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
  onAddOneToCard: (cardId: string) => void
  onOpenAddQuantityDialog: (cardId: string) => void
  onRemoveOneFromCard: (cardId: string) => void
  onOpenRemoveQuantityDialog: (cardId: string) => void
}

/** Overflow menu fields used to build card action rows (excludes ghost-click ref only needed by ⋮ triggers). */
export type DeckWorkspaceMenuActionSource = Omit<DeckWorkspaceOverflowMenusProps, "formatHintsMenuClosedAtRef">

export function buildDeckWorkspaceMenuItemProps(
  menus: DeckWorkspaceMenuActionSource,
  c: DeckCard,
  groupName: string
) {
  return {
    c,
    groupName,
    grouping: menus.grouping,
    commanderIds: menus.commanderIds,
    coverImageId: menus.coverImageId,
    allUniqueTags: menus.allUniqueTags,
    printings: menus.printingsByCard[c.id] ?? [],
    displayedFormat: menus.displayedFormat,
    customZoneIds: menus.customZoneIds,
    onEnsurePrintingsLoaded: menus.ensurePrintingsLoaded,
    onSetCommander: menus.onSetCommander,
    onSetCoverImage: menus.onSetCoverImage,
    onSetCardPrinting: menus.onSetCardPrinting,
    onSetCardFinish: menus.onSetCardFinish,
    onAddTag: menus.onAddTag,
    onRemoveTag: menus.onRemoveTag,
    onOpenCustomTagDialog: menus.onOpenCustomTagDialog,
    onMoveToZone: menus.onMoveToZone,
    onOpenCustomBoardDialog: menus.onOpenCustomBoardDialog,
    onDeleteCard: menus.onDeleteCard,
    onAddOneToCard: menus.onAddOneToCard,
    onOpenAddQuantityDialog: menus.onOpenAddQuantityDialog,
    onRemoveOneFromCard: menus.onRemoveOneFromCard,
    onOpenRemoveQuantityDialog: menus.onOpenRemoveQuantityDialog,
  }
}

export function DeckWorkspaceThreeDotMenu(
  props: DeckWorkspaceOverflowMenusProps & {
    c: DeckCard
    groupName: string
    align?: "start" | "end"
  }
) {
  const {
    c,
    groupName,
    align = "end",
    formatHintsMenuClosedAtRef,
    ...menus
  } = props
  if (!menus.isOwner || menus.viewing) return null
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void menus.ensurePrintingsLoaded(c)
        else {
          // Synchronous stamp so a portaled-menu "click-through" on the same frame
          // still sees a fresh window (queueMicrotask ran too late for list rows).
          stampPortaledMenuCloseGuard(formatHintsMenuClosedAtRef)
        }
      }}
    >
      <DropdownMenuTrigger
        aria-label={`Open options for ${c.name}`}
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-foreground/25 bg-background/95 text-foreground opacity-100 shadow-lg ring-2 ring-background/80 transition-colors hover:bg-accent hover:text-accent-foreground data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground"
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onContextMenu={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        finalFocus={false}
        className="w-56 bg-white border-border text-foreground"
        onPointerDownCapture={() => {
          stampPortaledMenuCloseGuard(formatHintsMenuClosedAtRef)
        }}
      >
        <DeckWorkspaceCardActionMenuItems variant="dropdown" {...buildDeckWorkspaceMenuItemProps(menus, c, groupName)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DeckWorkspacePreviewDropdownMenu(
  props: DeckWorkspaceOverflowMenusProps & { c: DeckCard; groupName: string }
) {
  const { c, groupName, ...menus } = props
  if (!menus.isOwner || menus.viewing) return null
  return (
    <div className="w-56 shrink-0 self-start">
      <DropdownMenu
        modal={false}
        open
        onOpenChange={(next) => {
          if (next) void menus.ensurePrintingsLoaded(c)
        }}
      >
        <DropdownMenuTrigger
          type="button"
          tabIndex={-1}
          aria-hidden
          className="h-2 w-full cursor-default border-0 bg-transparent p-0 opacity-0"
        />
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={4}
          positionerClassName="z-[90]"
          className="w-56 max-h-[80vh] overflow-y-auto border border-border bg-white text-foreground"
        >
          <DeckWorkspaceCardActionMenuItems variant="dropdown" {...buildDeckWorkspaceMenuItemProps(menus, c, groupName)} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
