"use client"

import type { CSSProperties } from "react"
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
import { CardThumbnail } from "./deck-workspace-card-media"
import {
  compareTypeGroupSectionKeys,
  deckCardDragId,
  groupSectionHeading,
  primaryDeckCardImage,
  visualDeckCardChrome,
} from "./deck-workspace-pure"
import { TAG_GROUP_UNTAGGED } from "./deck-workspace-constants"
import { DeckWorkspaceCardActionMenuItems } from "./deck-workspace-card-action-menu-items"
import {
  buildDeckWorkspaceMenuItemProps,
  DeckWorkspaceThreeDotMenu,
  type DeckWorkspaceOverflowMenusProps,
} from "./deck-workspace-overflow-menus"

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
  commanderCards: DeckCard[]
  displayedCards: DeckCard[]
  displayedCommanderIds: string[]
  displayedCoverImageId: string | null
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
    commanderCards,
    displayedCards,
    displayedCommanderIds,
    displayedCoverImageId,
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
  } = props

  return (
    <>
      {commanderCards.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {commanderCards.map((c) => (
            <button
              key={c.id}
              type="button"
              className="group flex w-64 items-center gap-3 rounded-xl border border-yellow-400/50 bg-card/80 p-2 text-left shadow-lg transition hover:border-yellow-300 overflow-hidden"
              onClick={() => showClickedPreview(c, "Commander")}
            >
              {primaryDeckCardImage(c) ? (
                <CardThumbnail card={c} className="h-24 shrink-0" imageClassName="h-24 w-auto rounded-lg border border-border/60" overlayClassName="rounded-lg" />
              ) : (
                <div className="flex h-24 aspect-[5/7] shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/40">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
                </div>
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-yellow-400/90 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-950">
                  <Crown className="h-3 w-3" /> Commander
                </div>
                <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.type_line}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {cardsLoading && liveCardCount === 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[5/7] rounded-xl border border-border/30 bg-card/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
            </div>
          ))}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onTagDragEnd}>
        {Object.entries(groupedCards)
          .sort(([a], [b]) => {
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
          })
          .map(([groupName, groupCards]) => {
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
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${collapsedSections.has(groupName) ? "-rotate-90" : ""}`}
                  />
                  <h3 className="text-xl font-bold text-foreground">
                    {groupSectionHeading(groupName, grouping)}{" "}
                    <span className="text-sm font-normal text-muted-foreground ml-2">({sectionQty})</span>
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
                                  onMouseEnter={vlist && vlist.length > 0 ? () => setDeckFormatHintHoverId(c.id) : undefined}
                                  onMouseLeave={vlist && vlist.length > 0 ? () => setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev)) : undefined}
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
                                  <CardThumbnail card={c} className="h-full w-full" imageClassName="h-full w-full object-cover" overlayClassName="rounded-none" />
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
                                      className={`absolute top-2 right-8 bg-background/80 text-foreground px-1.5 py-0.5 rounded text-xs font-bold border border-border transition-opacity ${
                                        vlist && vlist.length > 0 && deckFormatHintHoverId === c.id ? "opacity-0" : "opacity-100"
                                      }`}
                                    >
                                      x{c.quantity}
                                    </div>
                                  )}
                                  {c.tags && c.tags.length > 0 && (
                                    <div className="absolute bottom-1 left-1 flex flex-wrap gap-1 p-1 max-w-[60%]">
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
                        const numCols = Math.min(3, Math.max(1, Math.ceil(groupCards.length / 5)))
                        const colSize = Math.ceil(groupCards.length / numCols)
                        const columns = Array.from({ length: numCols }, (_, ci) => groupCards.slice(ci * colSize, (ci + 1) * colSize))

                        return (
                          <div className="flex flex-wrap gap-8">
                            {columns.map((colCards, colIdx) => {
                              const basePositions: number[] = []
                              let accY = 0
                              colCards.forEach((card) => {
                                basePositions.push(accY)
                                accY += stackPeek + (card.quantity > 1 ? stackExtraPeek : 0)
                              })
                              const colHeight = accY + stackCardHeight + stackHoverShift

                              return (
                                <div
                                  key={colIdx}
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
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredStack(null)
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
                                              <CardThumbnail card={card} imageClassName="w-full rounded-xl border border-black/60 shadow-xl" />
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
                                                <div className="absolute top-2 right-2 bg-background/85 text-foreground text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-border/60 shadow-sm leading-none">
                                                  {card.quantity}x
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
                              )
                            })}
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
                                  onMouseEnter={listV && listV.length > 0 ? () => setDeckFormatHintHoverId(c.id) : undefined}
                                  onMouseLeave={listV && listV.length > 0 ? () => setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev)) : undefined}
                                  className={`flex items-center justify-between p-2 hover:bg-accent/50 border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg relative cursor-grab active:cursor-grabbing${listV?.length ? " border-l-4 border-l-red-500" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    showClickedPreview(c, groupName)
                                  }}
                                >
                                  <div className="relative z-0 flex min-w-0 flex-1 items-center gap-3">
                                    <span className="text-muted-foreground w-4 text-right font-mono">{c.quantity}</span>
                                    {(c.face_images?.[0] || c.image_url) && (
                                      <CardThumbnail card={c} className="h-9 shrink-0" imageClassName="h-9 w-auto rounded border border-border/50" overlayClassName="rounded" />
                                    )}
                                    <ManaText text={c.name} className="font-medium cursor-pointer hover:text-primary transition-colors truncate" />
                                    <ManaText text={c.mana_cost} className="text-xs text-muted-foreground" />
                                  </div>
                                  <div className="flex items-center gap-3 ml-auto shrink-0">
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
      </DndContext>

      <div className="border-t border-border pt-8 mt-4">
        <DeckAnalytics
          cards={displayedCards.filter((c) => !displayedCommanderIds.includes(c.scryfall_id))}
          commanders={displayedCards.filter((c) => displayedCommanderIds.includes(c.scryfall_id))}
        />
      </div>
    </>
  )
}
