"use client"

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import { motion } from "framer-motion"
import { DndContext, type DragEndEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core"
import { ChevronDown, Crown, Image as ImageIcon, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { DeckAnalytics } from "@/components/deck-analytics"
import { ManaText } from "@/components/mana/ManaText"
import { formatPrice } from "@/lib/format"
import type { DeckCard, GroupingMode, ViewMode } from "@/lib/types"
import { DraggableDeckCard, DroppableTagGroup } from "./deck-workspace-dnd"
import { CardThumbnail, DeckBuilderVisualCardThumbnail } from "./deck-workspace-card-media"
import {
  compareTypeGroupSectionKeys,
  deckCardDragId,
  groupSectionHeading,
  visualDeckCardChrome,
} from "./deck-workspace-pure"
import { TAG_GROUP_UNTAGGED } from "./deck-workspace-constants"
import { DeckWorkspaceCardActionMenuItems } from "./deck-workspace-card-action-menu-items"
import {
  buildDeckWorkspaceMenuItemProps,
  DeckWorkspaceThreeDotMenu,
  type DeckWorkspaceOverflowMenusProps,
} from "./deck-workspace-overflow-menus"
import { cn } from "@/lib/utils"
import { isCommanderZone, zoneCountsTowardMainDeck } from "@/lib/zones"
import type { DeckFormatValidationStatus } from "@/lib/deck-format-validation"
import type { DeckRulesHoverPayload } from "./DeckWorkspaceCardRulesPreview"
import { DeckWorkspaceCardRulesPreview, rulesHoverPayloadToArtImageUrl, rulesHoverPayloadToFields } from "./DeckWorkspaceCardRulesPreview"
import { DeckWorkspaceDockCardArtPreview } from "./DeckWorkspaceDockCardArtPreview"

/** Horizontal gap between decklist section columns (matches `gap-4`). */
const SECTION_COLUMN_GAP_PX = 16

/** Minimum width for a list-mode section column (one full-width list card row). */
const LIST_SECTION_MIN_WIDTH_PX = 360

function useDecklistSectionColumnCount(viewMode: ViewMode, cardSize: number, containerRef: RefObject<HTMLElement | null>) {
  const [count, setCount] = useState(1)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const wide = window.matchMedia("(min-width: 48rem)").matches
      const w = el.clientWidth
      const gap = SECTION_COLUMN_GAP_PX

      if (!wide) {
        setCount(1)
        return
      }

      if (viewMode === "visual") {
        const minCol = cardSize * 2 + gap
        setCount(Math.min(3, Math.max(1, Math.floor((w + gap) / (minCol + gap)))))
      } else if (viewMode === "stack") {
        const minCol = cardSize
        setCount(Math.min(4, Math.max(1, Math.floor((w + gap) / (minCol + gap)))))
      } else {
        const minCol = LIST_SECTION_MIN_WIDTH_PX
        setCount(Math.min(2, Math.max(1, Math.floor((w + gap) / (minCol + gap)))))
      }
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mq = window.matchMedia("(min-width: 48rem)")
    mq.addEventListener("change", measure)
    return () => {
      ro.disconnect()
      mq.removeEventListener("change", measure)
    }
  }, [viewMode, cardSize, containerRef])

  return count
}

export type DeckWorkspaceGroupedDecklistProps = {
  groupedCards: Record<string, DeckCard[]>
  grouping: GroupingMode
  viewMode: ViewMode
  cardSize: number
  collapsedSections: Set<string>
  toggleSection: (name: string) => void
  toggleAllSections: (allNames: string[], anchorEl: HTMLElement) => void
  cardDragDisabled: boolean
  deckLandQtyIncludingMdfc: number
  /** Full deck across all zones; used for analytics + commander resolution. */
  fullWorkspaceCards: DeckCard[]
  displayedCommanderIds: string[]
  displayedCoverImageId: string | null
  displayedFormat: string | null
  formatValidationStatus: DeckFormatValidationStatus
  formatDeckViolations: readonly string[]
  formatViolationCardCount: number
  formatViolationMap: ReadonlyMap<string, readonly string[]>
  deckFormatHintHoverId: string | null
  setDeckFormatHintHoverId: React.Dispatch<React.SetStateAction<string | null>>
  hoveredStack: { groupName: string; colIdx: number; itemIdx: number } | null
  setHoveredStack: React.Dispatch<React.SetStateAction<{ groupName: string; colIdx: number; itemIdx: number } | null>>
  ensurePrintingsLoaded: (c: DeckCard) => void
  showClickedPreview: (c: DeckCard, groupName: string) => void
  stackPeek: number
  stackExtraPeek: number
  stackCardHeight: number
  stackHoverShift: number
  cardsLoading: boolean
  liveCardCount: number
  sensors: SensorDescriptor<SensorOptions>[]
  onTagDragEnd: (e: DragEndEvent) => void
  overflowMenus: DeckWorkspaceOverflowMenusProps
  rulesHover: DeckRulesHoverPayload
  onDeckCardRulesPreviewHover: (card: DeckCard | null, faceIndex?: number) => void
  deckCardFaceIndexById: Record<string, number>
  onDeckCardDisplayFaceChange: (cardId: string, nextFaceIndex: number) => void
  /** Right inset in px so fixed dock clears the deck assistant rail. */
  dockRightInsetPx: number
}

export function DeckWorkspaceGroupedDecklist(props: DeckWorkspaceGroupedDecklistProps) {
  const {
    groupedCards,
    grouping,
    viewMode,
    cardSize,
    collapsedSections,
    toggleSection,
    toggleAllSections,
    cardDragDisabled,
    deckLandQtyIncludingMdfc,
    fullWorkspaceCards,
    displayedCommanderIds,
    displayedCoverImageId,
    displayedFormat,
    formatValidationStatus,
    formatDeckViolations,
    formatViolationCardCount,
    formatViolationMap,
    deckFormatHintHoverId,
    setDeckFormatHintHoverId,
    hoveredStack,
    setHoveredStack,
    ensurePrintingsLoaded,
    showClickedPreview,
    stackPeek,
    stackExtraPeek,
    stackCardHeight,
    stackHoverShift,
    cardsLoading,
    liveCardCount,
    sensors,
    onTagDragEnd,
    overflowMenus,
    rulesHover,
    onDeckCardRulesPreviewHover,
    deckCardFaceIndexById,
    onDeckCardDisplayFaceChange,
    dockRightInsetPx,
  } = props

  const analyticsLibraryCards = useMemo(
    () =>
      fullWorkspaceCards.filter(
        (c) =>
          !displayedCommanderIds.includes(c.scryfall_id) && zoneCountsTowardMainDeck(c.zone),
      ),
    [fullWorkspaceCards, displayedCommanderIds],
  )

  const analyticsCommanderCards = useMemo(
    () =>
      displayedCommanderIds
        .map((id) => {
          const inCommanderZone = fullWorkspaceCards.find(
            (c) => c.scryfall_id === id && isCommanderZone(c.zone),
          )
          if (inCommanderZone) return inCommanderZone
          return fullWorkspaceCards.find((c) => c.scryfall_id === id)
        })
        .filter((c): c is DeckCard => Boolean(c)),
    [fullWorkspaceCards, displayedCommanderIds],
  )

  const previewFields = rulesHoverPayloadToFields(rulesHover)
  const artImageUrl = rulesHoverPayloadToArtImageUrl(rulesHover)

  const sortedGroupEntries = useMemo(
    () =>
      Object.entries(groupedCards).sort(([a], [b]) => {
        if (grouping === "mana") {
          const manaSortKey = (name: string) => {
            const prefix = "Mana Value "
            if (!name.startsWith(prefix)) return 0
            const n = Number(name.slice(prefix.length))
            return Number.isFinite(n) ? n : 0
          }
          return manaSortKey(a) - manaSortKey(b)
        }
        if (grouping === "type") return compareTypeGroupSectionKeys(a, b)
        if (grouping === "tag") {
          if (a === TAG_GROUP_UNTAGGED) return 1
          if (b === TAG_GROUP_UNTAGGED) return -1
          return a.localeCompare(b, undefined, { sensitivity: "base" })
        }
        return 0
      }),
    [groupedCards, grouping],
  )

  const sectionColumnsRef = useRef<HTMLDivElement>(null)
  const sectionColumnCount = useDecklistSectionColumnCount(viewMode, cardSize, sectionColumnsRef)

  const sectionColumnBuckets = useMemo(() => {
    const n = sectionColumnCount
    const cols: [string, DeckCard[]][][] = Array.from({ length: n }, () => [])
    sortedGroupEntries.forEach((entry, i) => {
      cols[i % n].push(entry)
    })
    return cols
  }, [sortedGroupEntries, sectionColumnCount])

  return (
    <>
      <div
        className="pointer-events-none fixed bottom-0 left-0 z-[60] hidden justify-center px-4 pt-4 pb-safe deck-wide:flex"
        style={{ right: dockRightInsetPx }}
      >
        <div className="pointer-events-none flex w-full max-w-7xl flex-col rounded-xl border border-border bg-background/80 p-3 text-foreground shadow-sm backdrop-blur-xl">
          <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
            <div
              className={cn(
                "pointer-events-none min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-transparent p-3",
                "max-h-[min(38vh,22rem)] sm:max-h-[min(42vh,26rem)]"
              )}
            >
              <DeckWorkspaceCardRulesPreview fields={previewFields} />
            </div>
            <DeckWorkspaceDockCardArtPreview
              key={artImageUrl ?? ""}
              imageUrl={artImageUrl}
              label={previewFields?.name ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="pb-10 deck-wide:pb-[clamp(22rem,52vh,36rem)]">
        {cardsLoading && liveCardCount === 0 && (
          <div className="grid grid-cols-2 deck-wide:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[5/7] rounded-xl border border-border/30 bg-card/30 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
              </div>
            ))}
          </div>
        )}
        <DndContext sensors={sensors} onDragEnd={onTagDragEnd}>
        <div
          ref={sectionColumnsRef}
          className="flex w-full items-start"
          style={{ gap: SECTION_COLUMN_GAP_PX }}
        >
        {sectionColumnBuckets.map((columnEntries, layoutColIdx) => (
          <div key={layoutColIdx} className="flex min-w-0 flex-1 flex-col gap-5">
            {columnEntries.map(([groupName, groupCards]) => {
            const sectionQty =
              grouping === "type" && groupName === "Land" ? deckLandQtyIncludingMdfc : groupCards.reduce((acc, c) => acc + c.quantity, 0)
            return (
              <DroppableTagGroup key={groupName} id={groupName} enabled={!cardDragDisabled && groupName !== TAG_GROUP_UNTAGGED}>
                <button
                  type="button"
                  onClick={() => toggleSection(groupName)}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    toggleAllSections(Object.keys(groupedCards), e.currentTarget)
                  }}
                  className="flex w-full items-center gap-2 border-b border-border pb-2 mb-4 text-left group"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${collapsedSections.has(groupName) ? "-rotate-90" : ""}`}
                  />
                  <h3 className="text-lg font-bold text-foreground">
                    {groupSectionHeading(groupName, grouping)}{" "}
                    <span className="text-xs font-normal text-muted-foreground ml-2">({sectionQty})</span>
                  </h3>
                </button>
                {collapsedSections.has(groupName) ? null : (
                  <>
                    {viewMode === "visual" && (
                      <div
                        className="grid justify-start gap-4"
                        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))` }}
                      >
                        {groupCards.map((c) => {
                          const vlist = formatViolationMap.get(c.id)
                          return (
                            <ContextMenu key={c.id} onOpenChange={(o) => { if (o) void ensurePrintingsLoaded(c) }}>
                              <ContextMenuTrigger>
                                <DraggableDeckCard
                                  id={deckCardDragId(grouping, groupName, c.id)}
                                  disabled={cardDragDisabled}
                                  onMouseEnter={() => {
                                    if (vlist && vlist.length > 0) setDeckFormatHintHoverId(c.id)
                                    onDeckCardRulesPreviewHover(c, deckCardFaceIndexById[c.id] ?? 0)
                                  }}
                                  onMouseLeave={() => {
                                    if (vlist && vlist.length > 0) {
                                      setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev))
                                    }
                                    onDeckCardRulesPreviewHover(null)
                                  }}
                                  className={`relative rounded-xl overflow-hidden border cursor-grab active:cursor-grabbing shadow-xl aspect-[5/7] transition-all ${visualDeckCardChrome(c, {
                                    commanderIds: displayedCommanderIds,
                                    coverImageId: displayedCoverImageId,
                                    violations: vlist,
                                  })}`}
                                  style={{ width: cardSize }}
                                >
                                  <button
                                    type="button"
                                    className="absolute inset-0 z-10 cursor-grab bg-transparent p-0 text-left active:cursor-grabbing"
                                    aria-label={`Preview ${c.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      showClickedPreview(c, groupName)
                                    }}
                                  />
                                  <DeckBuilderVisualCardThumbnail
                                    card={c}
                                    faceIndex={deckCardFaceIndexById[c.id] ?? 0}
                                    onFaceIndexChange={(next) => onDeckCardDisplayFaceChange(c.id, next)}
                                    className="h-full w-full"
                                    thumbnailClassName="h-full w-full"
                                    imageClassName="h-full w-full object-cover"
                                    overlayClassName="rounded-none"
                                  />
                                  {displayedCommanderIds.includes(c.scryfall_id) && (
                                    <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg">
                                      <Crown className="w-2.5 h-2.5" /> CMD
                                    </div>
                                  )}
                                  {displayedCoverImageId === c.scryfall_id && (
                                    <div
                                      className="absolute left-2 bg-blue-400/90 text-blue-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg"
                                      style={{ top: displayedCommanderIds.includes(c.scryfall_id) ? "1.75rem" : "0.5rem" }}
                                    >
                                      <ImageIcon className="w-2.5 h-2.5" /> Cover
                                    </div>
                                  )}
                                  {c.quantity > 1 && (
                                    <div
                                      className={`pointer-events-none absolute bottom-2 left-2 z-[12] bg-background/90 text-foreground px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none rounded-full border border-border/60 shadow-sm transition-opacity ${
                                        vlist && vlist.length > 0 && deckFormatHintHoverId === c.id ? "opacity-0" : "opacity-100"
                                      }`}
                                    >
                                      x{c.quantity}
                                    </div>
                                  )}
                                  {c.tags && c.tags.length > 0 && (
                                    <div
                                      className={cn(
                                        "absolute bottom-1 flex flex-wrap gap-1 p-1 max-w-[60%]",
                                        c.quantity > 1 ? "left-10" : "left-1"
                                      )}
                                    >
                                      {c.tags.map((t) => (
                                        <Badge key={t} className="text-[10px] px-1.5 py-0 bg-background/80 text-foreground border-border truncate max-w-full">
                                          {t}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  <div className="absolute bottom-1 right-1 z-20 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                                    {formatPrice(c.price_usd)}
                                  </div>
                                  {vlist && vlist.length > 0 && (
                                    <div
                                      className={`pointer-events-none absolute inset-x-1 bottom-9 z-[25] max-h-[42%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                                        deckFormatHintHoverId === c.id ? "opacity-100" : "opacity-0"
                                      }`}
                                    >
                                      <div className="rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-left text-[10px] leading-snug text-red-100">
                                        <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                                        <ul className="space-y-0.5">
                                          {vlist.map((line) => (
                                            <li key={line} className="list-disc pl-3.5 marker:text-red-400/90">
                                              {line}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  )}
                                  {(c.printing_scryfall_id || c.finish !== "nonfoil") && c.set_code && (
                                    <div className="absolute top-2 right-9 bg-background/80 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border border-border">
                                      {c.set_code}
                                      {c.finish === "foil" ? " ★" : c.finish === "etched" ? " ✦" : ""}
                                    </div>
                                  )}
                                  <div className="absolute top-1.5 right-1.5 z-20">
                                    <DeckWorkspaceThreeDotMenu {...overflowMenus} c={c} groupName={groupName} align="end" />
                                  </div>
                                </DraggableDeckCard>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-56 bg-white border-border text-foreground">
                                <DeckWorkspaceCardActionMenuItems variant="context" {...buildDeckWorkspaceMenuItemProps(overflowMenus, c, groupName)} />
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })}
                      </div>
                    )}

                    {viewMode === "stack" &&
                      (() => {
                        const colIdx = 0
                        const colCards = groupCards
                        const basePositions: number[] = []
                        let accY = 0
                        colCards.forEach((card) => {
                          basePositions.push(accY)
                          accY += stackPeek + (card.quantity > 1 ? stackExtraPeek : 0)
                        })
                        const colHeight = accY + stackCardHeight + stackHoverShift

                        return (
                          <div className="flex flex-wrap">
                            <div
                              className="relative shrink-0"
                              style={{ width: cardSize, height: colHeight }}
                              onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                const mouseY = e.clientY - rect.top
                                let activeIdx = 0
                                for (let i = 1; i < colCards.length; i++) {
                                  if (mouseY >= basePositions[i]) activeIdx = i
                                  else break
                                }
                                setHoveredStack({ groupName, colIdx, itemIdx: activeIdx })
                                const activeCard = colCards[activeIdx]
                                onDeckCardRulesPreviewHover(activeCard ?? null, activeCard ? deckCardFaceIndexById[activeCard.id] ?? 0 : undefined)
                              }}
                              onMouseLeave={() => {
                                setHoveredStack(null)
                                onDeckCardRulesPreviewHover(null)
                              }}
                            >
                              {colCards.map((card, itemIdx) => {
                                const isHovered =
                                  !!hoveredStack &&
                                  hoveredStack.groupName === groupName &&
                                  hoveredStack.colIdx === colIdx &&
                                  hoveredStack.itemIdx === itemIdx
                                const isBelow =
                                  !!hoveredStack &&
                                  hoveredStack.groupName === groupName &&
                                  hoveredStack.colIdx === colIdx &&
                                  itemIdx > hoveredStack.itemIdx
                                const stackViolations = formatViolationMap.get(card.id)

                                const dragStyle: CSSProperties = {
                                  top: basePositions[itemIdx],
                                  zIndex: isHovered ? colCards.length + 10 : itemIdx + 1,
                                }

                                return (
                                  <ContextMenu key={card.id} onOpenChange={(o) => { if (o) void ensurePrintingsLoaded(card) }}>
                                    <ContextMenuTrigger>
                                      <DraggableDeckCard
                                        id={deckCardDragId(grouping, groupName, card.id)}
                                        disabled={cardDragDisabled}
                                        className="absolute w-full cursor-grab active:cursor-grabbing group"
                                        style={dragStyle}
                                      >
                                        <motion.div
                                          className={`relative rounded-xl${stackViolations?.length ? " ring-2 ring-red-500/55 ring-offset-2 ring-offset-background" : ""}`}
                                          animate={{
                                            y: isHovered ? -12 : isBelow ? stackHoverShift : 0,
                                            scale: isHovered ? 1.05 : 1,
                                          }}
                                          transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.4 }}
                                        >
                                          <button
                                            type="button"
                                            className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
                                            aria-label={`Preview ${card.name}`}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              showClickedPreview(card, groupName)
                                            }}
                                          />
                                          <DeckBuilderVisualCardThumbnail
                                            card={card}
                                            faceIndex={deckCardFaceIndexById[card.id] ?? 0}
                                            onFaceIndexChange={(next) => onDeckCardDisplayFaceChange(card.id, next)}
                                            className="w-full"
                                            imageClassName="w-full rounded-xl border border-black/60 shadow-xl"
                                            overlayClassName="rounded-xl"
                                          />
                                          {stackViolations && stackViolations.length > 0 && (
                                            <div
                                              className={`pointer-events-none absolute inset-x-1 bottom-9 z-[25] max-h-[42%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                                                isHovered ? "opacity-100" : "opacity-0"
                                              }`}
                                            >
                                              <div className="rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-left text-[10px] leading-snug text-red-100">
                                                <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                                                <ul className="space-y-0.5">
                                                  {stackViolations.map((line) => (
                                                    <li key={line} className="list-disc pl-3.5 marker:text-red-400/90">
                                                      {line}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            </div>
                                          )}
                                          {card.quantity > 1 && (
                                            <div className="pointer-events-none absolute bottom-2 left-2 z-[15] bg-background/90 text-foreground text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full border border-border/60 shadow-sm leading-none">
                                              x{card.quantity}
                                            </div>
                                          )}
                                          {displayedCommanderIds.includes(card.scryfall_id) && (
                                            <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-0.5 shadow">
                                              <Crown className="w-2.5 h-2.5" /> CMD
                                            </div>
                                          )}
                                          <div className="absolute top-2 right-2 z-20">
                                            <DeckWorkspaceThreeDotMenu {...overflowMenus} c={card} groupName={groupName} align="end" />
                                          </div>
                                          {itemIdx === colCards.length - 1 && (
                                            <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                                              {formatPrice(card.price_usd)}
                                            </div>
                                          )}
                                        </motion.div>
                                      </DraggableDeckCard>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="w-56 bg-white border-border text-foreground">
                                      <DeckWorkspaceCardActionMenuItems variant="context" {...buildDeckWorkspaceMenuItemProps(overflowMenus, card, groupName)} />
                                    </ContextMenuContent>
                                  </ContextMenu>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                    {viewMode === "list" && (
                      <div className="bg-card/50 rounded-lg border border-border">
                        {groupCards.map((c) => {
                          const listV = formatViolationMap.get(c.id)
                          return (
                            <ContextMenu key={c.id} onOpenChange={(o) => { if (o) void ensurePrintingsLoaded(c) }}>
                              <ContextMenuTrigger>
                                <DraggableDeckCard
                                  id={deckCardDragId(grouping, groupName, c.id)}
                                  disabled={cardDragDisabled}
                                  onMouseEnter={() => {
                                    if (listV && listV.length > 0) setDeckFormatHintHoverId(c.id)
                                    onDeckCardRulesPreviewHover(c, deckCardFaceIndexById[c.id] ?? 0)
                                  }}
                                  onMouseLeave={() => {
                                    if (listV && listV.length > 0) {
                                      setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev))
                                    }
                                    onDeckCardRulesPreviewHover(null)
                                  }}
                                  className={`flex items-center justify-between p-2 hover:bg-accent/50 border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg relative cursor-grab active:cursor-grabbing${listV?.length ? " border-l-4 border-l-red-500" : ""}`}
                                >
                                  <div
                                    className="relative z-0 flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      showClickedPreview(c, groupName)
                                    }}
                                  >
                                    <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">{c.quantity}</span>
                                    {(c.face_images?.[0] || c.image_url) && (
                                      <CardThumbnail card={c} className="h-8 shrink-0" imageClassName="h-8 w-auto rounded border border-border/50" overlayClassName="rounded" />
                                    )}
                                    <ManaText text={c.name} className="text-sm font-medium cursor-pointer truncate transition-colors hover:text-primary" />
                                    <ManaText text={c.mana_cost} className="text-[11px] text-muted-foreground" />
                                  </div>
                                  <div
                                    className="flex items-center gap-3 ml-auto shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-xs font-mono text-muted-foreground tabular-nums w-16 text-right">{formatPrice(c.price_usd)}</span>
                                    <DeckWorkspaceThreeDotMenu {...overflowMenus} c={c} groupName={groupName} align="end" />
                                  </div>
                                  {listV && listV.length > 0 && (
                                    <div
                                      className={`pointer-events-none absolute inset-x-2 top-1/2 z-30 max-h-[calc(100%-0.5rem)] -translate-y-1/2 overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                                        deckFormatHintHoverId === c.id ? "opacity-100" : "opacity-0"
                                      }`}
                                    >
                                      <div className="ml-auto w-[min(100%,22rem)] rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-[10px] leading-snug text-red-100">
                                        <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                                        <ul className="space-y-0.5">
                                          {listV.map((line) => (
                                            <li key={line} className="list-disc pl-3.5 text-left marker:text-red-400/90">
                                              {line}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  )}
                                </DraggableDeckCard>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-56 bg-white border-border text-foreground">
                                <DeckWorkspaceCardActionMenuItems variant="context" {...buildDeckWorkspaceMenuItemProps(overflowMenus, c, groupName)} />
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </DroppableTagGroup>
            )
          })}
          </div>
        ))}
        </div>
      </DndContext>

      <div className="border-t border-border pt-8 mt-4">
        <DeckAnalytics
          cards={analyticsLibraryCards}
          commanders={analyticsCommanderCards}
          onDeckCardRulesPreviewHover={onDeckCardRulesPreviewHover}
          formatValidationSummary={{
            status: formatValidationStatus,
            formatKey: displayedFormat,
            deckViolations: formatDeckViolations,
            violationCardCount: formatViolationCardCount,
          }}
        />
      </div>
      </div>
    </>
  )
}
