"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Lock, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DeckCard } from "@/lib/types"
import {
  getZoneLabel,
  getZonesForFormat,
  isZoneLockedForFormat,
  normalizeCardZone,
  REGISTRY_ZONE_IDS,
  type ZoneDefinition,
} from "@/lib/zones"

const NEW_CUSTOM_BOARD_VALUE = "__new_custom_board__"

interface DeckWorkspaceBoardsTabProps {
  cards: DeckCard[]
  format: string | null | undefined
  isOwner: boolean
  viewing: boolean
  onMoveCardsToZone: (cardIds: string[], zone: string) => void
  onOpenCustomBoardForCards: (cardIds: string[]) => void
  onRemoveBoard: (zoneId: string) => void
  activeZone: string
  onZoneChange: (zone: string) => void
  /** Double-click a board tile: jump to deck list with that board selected. */
  onZoneOpenInDecklist: (zone: string) => void
}

export function DeckWorkspaceBoardsTab({
  cards,
  format,
  isOwner,
  viewing,
  onMoveCardsToZone,
  onOpenCustomBoardForCards,
  onRemoveBoard,
  activeZone,
  onZoneChange,
  onZoneOpenInDecklist,
}: DeckWorkspaceBoardsTabProps) {
  const allZoneIds = Array.from(new Set(cards.map((c) => normalizeCardZone(c.zone))))
  const customZoneIds = allZoneIds.filter((id) => !REGISTRY_ZONE_IDS.has(id))

  const zones = getZonesForFormat(format, customZoneIds)

  const cardsByZone = useCallback(
    (zoneId: string) => cards.filter((c) => normalizeCardZone(c.zone) === zoneId),
    [cards]
  )

  const quantityByZone = (zoneId: string) =>
    cardsByZone(zoneId).reduce((sum, c) => sum + c.quantity, 0)

  const interactionsLocked = !isOwner || viewing

  const zoneCards = useMemo(
    () =>
      cardsByZone(activeZone)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeZone, cardsByZone]
  )

  const zoneCardIds = useMemo(() => zoneCards.map((c) => c.id), [zoneCards])

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())

  const selectedIds = useMemo(() => {
    const allowed = new Set(zoneCardIds)
    const next = new Set<string>()
    for (const id of selectedKeys) {
      if (allowed.has(id)) next.add(id)
    }
    return next
  }, [selectedKeys, zoneCardIds])

  const allSelected = zoneCardIds.length > 0 && selectedIds.size === zoneCardIds.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = someSelected
  }, [someSelected])

  const toggleSelectAll = () => {
    if (allSelected) setSelectedKeys(new Set())
    else setSelectedKeys(new Set(zoneCardIds))
  }

  const toggleOne = (id: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedKeys(new Set())

  const runBulkMove = (zoneId: string) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    onMoveCardsToZone(ids, zoneId)
    clearSelection()
  }

  const runBulkCustomBoard = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    onOpenCustomBoardForCards(ids)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {zones.map((zone) => (
          <BoardCard
            key={zone.id}
            zone={zone}
            cardCount={cardsByZone(zone.id).length}
            quantity={quantityByZone(zone.id)}
            format={format}
            isActive={activeZone === zone.id}
            interactionsLocked={interactionsLocked}
            onSelect={() => onZoneChange(zone.id)}
            onOpenInDecklist={() => onZoneOpenInDecklist(zone.id)}
            onRemove={
              !isZoneLockedForFormat(zone.id, format) && !zone.locked && !interactionsLocked
                ? () => onRemoveBoard(zone.id)
                : undefined
            }
          />
        ))}
      </div>

      {!interactionsLocked && (
        <p className="text-xs text-muted-foreground">
          Use checkboxes to select cards, then move the selection in bulk. You can also use{" "}
          <strong>Move to…</strong> on each row, including <strong>New custom board…</strong>.
        </p>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {getZoneLabel(activeZone)}{" "}
            <span className="font-normal text-muted-foreground">
              ({quantityByZone(activeZone)} card{quantityByZone(activeZone) !== 1 ? "s" : ""})
            </span>
          </h3>
          {!interactionsLocked && zoneCards.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border border-border bg-card accent-primary"
              />
              Select all in board
            </label>
          )}
        </div>

        {!interactionsLocked && selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <MoveToBoardSelect
              label="Move selection to…"
              zones={zones}
              currentZone={activeZone}
              onMoveToZone={runBulkMove}
              onOpenCustomBoard={runBulkCustomBoard}
            />
          </div>
        )}

        {zoneCards.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No cards in this board.</p>
        ) : (
          <div className="space-y-1">
            {zoneCards.map((card) => (
              <ZoneCardRow
                key={card.id}
                card={card}
                zones={zones}
                currentZone={activeZone}
                interactionsLocked={interactionsLocked}
                checked={selectedIds.has(card.id)}
                onToggleChecked={() => toggleOne(card.id)}
                onMoveToZone={(zoneId) => onMoveCardsToZone([card.id], zoneId)}
                onOpenCustomBoard={() => onOpenCustomBoardForCards([card.id])}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MoveToBoardSelect({
  label,
  zones,
  currentZone,
  onMoveToZone,
  onOpenCustomBoard,
}: {
  label?: string
  zones: ZoneDefinition[]
  currentZone: string
  onMoveToZone: (zoneId: string) => void
  onOpenCustomBoard: () => void
}) {
  const otherZones = zones.filter((z) => z.id !== currentZone)
  const hasTargets = otherZones.length > 0

  if (!hasTargets) {
    return (
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenCustomBoard}>
        New custom board…
      </Button>
    )
  }

  return (
    <select
      aria-label={label ?? "Move to board"}
      className="h-7 max-w-[200px] rounded border border-border bg-card px-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground"
      value=""
      onChange={(e) => {
        const v = e.target.value
        e.target.value = ""
        if (!v) return
        if (v === NEW_CUSTOM_BOARD_VALUE) onOpenCustomBoard()
        else onMoveToZone(v)
      }}
      title={label ?? "Move to board"}
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">{label ?? "Move to…"}</option>
      {otherZones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.label}
        </option>
      ))}
      <option value={NEW_CUSTOM_BOARD_VALUE}>New custom board…</option>
    </select>
  )
}

function BoardCard({
  zone,
  cardCount,
  quantity,
  format,
  isActive,
  interactionsLocked,
  onSelect,
  onOpenInDecklist,
  onRemove,
}: {
  zone: ZoneDefinition
  cardCount: number
  quantity: number
  format: string | null | undefined
  isActive: boolean
  interactionsLocked: boolean
  onSelect: () => void
  onOpenInDecklist: () => void
  onRemove?: () => void
}) {
  const locked = isZoneLockedForFormat(zone.id, format)

  return (
    <div
      title="Double-click to open in deck list"
      className={`relative flex flex-col gap-1 rounded-lg border px-4 py-3 transition-colors cursor-pointer min-w-[140px] ${
        isActive
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-card/80"
      }`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault()
        onOpenInDecklist()
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{zone.label}</span>
        {locked && (
          <Lock className="h-3 w-3 text-muted-foreground" aria-label="Locked for this format" />
        )}
        {!interactionsLocked && onRemove && (
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
            title={`Remove ${zone.label}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{quantity}</span>
        <span className="text-xs text-muted-foreground">
          {cardCount === quantity
            ? `card${cardCount !== 1 ? "s" : ""}`
            : `card${cardCount !== 1 ? "s" : ""} (${cardCount} unique)`}
        </span>
      </div>
      {zone.maxCards != null && (
        <div className="mt-0.5">
          <Badge
            variant={quantity > zone.maxCards ? "destructive" : "outline"}
            className="px-1.5 py-0 text-[10px]"
          >
            max {zone.maxCards}
          </Badge>
        </div>
      )}
      {!zone.countsTowardMainDeck && (
        <p className="text-[10px] text-muted-foreground">Excluded from deck size</p>
      )}
    </div>
  )
}

function ZoneCardRow({
  card,
  zones,
  currentZone,
  interactionsLocked,
  checked,
  onToggleChecked,
  onMoveToZone,
  onOpenCustomBoard,
}: {
  card: DeckCard
  zones: ZoneDefinition[]
  currentZone: string
  interactionsLocked: boolean
  checked: boolean
  onToggleChecked: () => void
  onMoveToZone: (zoneId: string) => void
  onOpenCustomBoard: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40 text-sm">
      {!interactionsLocked && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${card.name}`}
          className="h-3.5 w-3.5 shrink-0 rounded border border-border bg-card accent-primary"
        />
      )}
      <span className="tabular-nums text-muted-foreground w-5 text-right">{card.quantity}</span>
      <span className="min-w-0 flex-1 truncate">{card.name}</span>
      {!interactionsLocked && (
        <MoveToBoardSelect
          zones={zones}
          currentZone={currentZone}
          onMoveToZone={onMoveToZone}
          onOpenCustomBoard={onOpenCustomBoard}
        />
      )}
    </div>
  )
}
