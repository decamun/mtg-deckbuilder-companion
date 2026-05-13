"use client"

import { useState } from "react"
import { Plus, Lock, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { DeckCard } from "@/lib/types"
import {
  getZoneLabel,
  getZonesForFormat,
  isZoneLockedForFormat,
  type ZoneDefinition,
} from "@/lib/zones"

interface DeckWorkspaceBoardsTabProps {
  cards: DeckCard[]
  format: string | null | undefined
  isOwner: boolean
  viewing: boolean
  onMoveCardToZone: (cardId: string, zone: string) => void
  onAddCustomBoard: (zoneId: string) => void
  onRemoveBoard: (zoneId: string) => void
  activeZone: string
  onZoneChange: (zone: string) => void
}

export function DeckWorkspaceBoardsTab({
  cards,
  format,
  isOwner,
  viewing,
  onMoveCardToZone,
  onAddCustomBoard,
  onRemoveBoard,
  activeZone,
  onZoneChange,
}: DeckWorkspaceBoardsTabProps) {
  const [newBoardName, setNewBoardName] = useState("")
  const [addingBoard, setAddingBoard] = useState(false)

  // Find all distinct zone ids across all cards (to show custom boards in use)
  const allZoneIds = Array.from(new Set(cards.map((c) => c.zone ?? "mainboard")))
  const customZoneIds = allZoneIds.filter((id) => !["mainboard", "sideboard", "maybeboard"].includes(id))

  const zones = getZonesForFormat(format, customZoneIds)

  const cardsByZone = (zoneId: string) =>
    cards.filter((c) => (c.zone ?? "mainboard") === zoneId)

  const quantityByZone = (zoneId: string) =>
    cardsByZone(zoneId).reduce((sum, c) => sum + c.quantity, 0)

  const handleAddBoard = () => {
    const boardZoneId = newBoardName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    if (!boardZoneId) return
    const reservedIds = new Set(["mainboard", "sideboard", "maybeboard"])
    if (reservedIds.has(boardZoneId)) {
      toast.error(`"${boardZoneId}" is a reserved board name. Please choose a different name.`)
      return
    }
    onAddCustomBoard(boardZoneId)
    setNewBoardName("")
    setAddingBoard(false)
  }

  const interactionsLocked = !isOwner || viewing

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
            onRemove={
              !isZoneLockedForFormat(zone.id, format) && !zone.locked && !interactionsLocked
                ? () => onRemoveBoard(zone.id)
                : undefined
            }
          />
        ))}
      </div>

      {!interactionsLocked && (
        <div>
          {addingBoard ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handleAddBoard()
              }}
            >
              <input
                autoFocus
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Board name (e.g. Wishboard)"
                className="h-8 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!newBoardName.trim()}>
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingBoard(false)
                  setNewBoardName("")
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddingBoard(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Custom Board
            </Button>
          )}
        </div>
      )}

      {/* Zone detail: cards in the active zone */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {getZoneLabel(activeZone)}{" "}
          <span className="font-normal text-muted-foreground">
            ({quantityByZone(activeZone)} card{quantityByZone(activeZone) !== 1 ? "s" : ""})
          </span>
        </h3>
        {cardsByZone(activeZone).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No cards in this board.</p>
        ) : (
          <div className="space-y-1">
            {cardsByZone(activeZone)
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((card) => (
                <ZoneCardRow
                  key={card.id}
                  card={card}
                  zones={zones}
                  currentZone={activeZone}
                  interactionsLocked={interactionsLocked}
                  onMoveToZone={(zoneId) => onMoveCardToZone(card.id, zoneId)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
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
  onRemove,
}: {
  zone: ZoneDefinition
  cardCount: number
  quantity: number
  format: string | null | undefined
  isActive: boolean
  interactionsLocked: boolean
  onSelect: () => void
  onRemove?: () => void
}) {
  const locked = isZoneLockedForFormat(zone.id, format)

  return (
    <div
      className={`relative flex flex-col gap-1 rounded-lg border px-4 py-3 transition-colors cursor-pointer min-w-[140px] ${
        isActive
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-card/80"
      }`}
      onClick={onSelect}
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
  onMoveToZone,
}: {
  card: DeckCard
  zones: ZoneDefinition[]
  currentZone: string
  interactionsLocked: boolean
  onMoveToZone: (zoneId: string) => void
}) {
  const otherZones = zones.filter((z) => z.id !== currentZone)

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40 text-sm">
      <span className="tabular-nums text-muted-foreground w-5 text-right">{card.quantity}</span>
      <span className="flex-1 truncate">{card.name}</span>
      {!interactionsLocked && otherZones.length > 0 && (
        <select
          className="h-6 rounded border border-border bg-card px-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground"
          value=""
          onChange={(e) => {
            if (e.target.value) onMoveToZone(e.target.value)
          }}
          title="Move to board"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">Move to…</option>
          {otherZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
