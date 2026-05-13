"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Badge } from "@/components/ui/badge"
import { ManaText } from "@/components/mana/ManaText"
import type { DeckCard } from "@/lib/types"
import {
  DEFAULT_CARD_ZONE_ID,
  getZoneLabel,
  normalizeCardZone,
} from "@/lib/zones"
import { getCardTypeGroup, typeGroupSectionSortMeta } from "@/lib/card-types"

function primaryCardImage(card: DeckCard): string | undefined {
  return card.face_images?.[0]?.normal ?? card.face_images?.[0]?.small ?? card.image_url
}

function CardFaceImage({ card, className, alt = card.name }: { card: DeckCard; className: string; alt?: string }) {
  const imageUrl = primaryCardImage(card)
  if (!imageUrl) return null

  return <img src={imageUrl} alt={alt} className={className} draggable={false} />
}

type DiffSide = {
  label: string
  cards: DeckCard[]
}

type DiffStatus = "added" | "removed" | "changed" | "unchanged"

type CardStack = {
  card: DeckCard
  quantity: number
}

type DiffEntry = {
  key: string
  before?: CardStack
  after?: CardStack
  status: DiffStatus
  typeGroup: string
  sortName: string
}


interface DeckDiffViewProps {
  before: DiffSide
  after: DiffSide
}

function typeGroupCompare(a: string, b: string): number {
  const ma = typeGroupSectionSortMeta(a)
  const mb = typeGroupSectionSortMeta(b)
  if (ma.tier !== mb.tier) return ma.tier - mb.tier
  return ma.name.localeCompare(mb.name)
}

function typeGroup(card: DeckCard | undefined): string {
  return getCardTypeGroup(card?.type_line)
}

function cardComparisonKey(card: DeckCard): string {
  return [
    normalizeCardZone(card.zone),
    card.oracle_id || card.scryfall_id,
    card.effective_printing_id || card.printing_scryfall_id || card.scryfall_id,
    card.finish || "nonfoil",
  ].join("|")
}

function cardBaseKey(card: DeckCard): string {
  return [
    normalizeCardZone(card.zone),
    card.oracle_id || card.scryfall_id,
    card.name,
  ].join("|")
}

function aggregateCards(cards: DeckCard[]): Map<string, CardStack> {
  const stacks = new Map<string, CardStack>()
  for (const card of cards) {
    const key = cardComparisonKey(card)
    const existing = stacks.get(key)
    const quantity = existing ? existing.quantity + card.quantity : card.quantity
    stacks.set(key, {
      card: { ...(existing?.card ?? card), quantity },
      quantity,
    })
  }
  return stacks
}

function createEntry(key: string, before?: CardStack, after?: CardStack): DiffEntry {
  const status: DiffStatus = before && after
    ? before.quantity === after.quantity && cardComparisonKey(before.card) === cardComparisonKey(after.card) ? "unchanged" : "changed"
    : before ? "removed" : "added"
  const displayCard = after?.card ?? before?.card

  return {
    key,
    before,
    after,
    status,
    typeGroup: typeGroup(displayCard),
    sortName: displayCard?.name ?? "",
  }
}

function buildDiff(beforeCards: DeckCard[], afterCards: DeckCard[]): DiffEntry[] {
  const before = aggregateCards(beforeCards)
  const after = aggregateCards(afterCards)
  const entries: DiffEntry[] = []

  for (const [key, beforeStack] of before) {
    const afterStack = after.get(key)
    if (!afterStack) continue
    entries.push(createEntry(key, beforeStack, afterStack))
    before.delete(key)
    after.delete(key)
  }

  const afterByBase = new Map<string, Array<[string, CardStack]>>()
  for (const entry of after) {
    const key = cardBaseKey(entry[1].card)
    afterByBase.set(key, [...(afterByBase.get(key) ?? []), entry])
  }

  for (const [beforeKey, beforeStack] of Array.from(before.entries())) {
    const baseKey = cardBaseKey(beforeStack.card)
    const candidates = afterByBase.get(baseKey) ?? []
    const match = candidates.shift()
    if (candidates.length === 0) afterByBase.delete(baseKey)
    if (!match) continue

    const [afterKey, afterStack] = match
    entries.push(createEntry(`${beforeKey}=>${afterKey}`, beforeStack, afterStack))
    before.delete(beforeKey)
    after.delete(afterKey)
  }

  for (const [key, beforeStack] of before) entries.push(createEntry(key, beforeStack))
  for (const [key, afterStack] of after) entries.push(createEntry(key, undefined, afterStack))

  return entries.sort((a, b) => {
    const typeDelta = typeGroupCompare(a.typeGroup, b.typeGroup)
    if (typeDelta !== 0) return typeDelta
    return a.sortName.localeCompare(b.sortName)
  })
}

function statusClasses(status: DiffStatus, present: boolean): string {
  if (!present) return "border-dashed border-border/60 bg-muted/20 text-muted-foreground"
  if (status === "added") return "border-emerald-500/40 bg-emerald-500/10"
  if (status === "removed") return "border-red-500/40 bg-red-500/10"
  if (status === "changed") return "border-amber-500/40 bg-amber-500/10"
  return "border-border bg-card/50"
}

function statusLabel(status: DiffStatus): string {
  if (status === "added") return "Added"
  if (status === "removed") return "Removed"
  if (status === "changed") return "Changed"
  return "Unchanged"
}

function finishLabel(finish: DeckCard["finish"]): string {
  if (finish === "foil") return "Foil"
  if (finish === "etched") return "Etched"
  return "Nonfoil"
}

function CardArtPreview({ card }: { card: DeckCard }) {
  const imageUrl = primaryCardImage(card)
  return (
    <div className="relative">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={card.name} className="w-64 rounded-xl border border-border/50 shadow-2xl" draggable={false} />
          {(card.finish === "foil" || card.finish === "etched") && (
            <div className="absolute inset-0 pointer-events-none foil-overlay rounded-xl" />
          )}
        </>
      ) : (
        <div className="flex aspect-[5/7] w-64 items-center justify-center rounded-xl border border-border/40 bg-card/50 text-sm text-muted-foreground">
          No preview
        </div>
      )}
    </div>
  )
}

function CardCell({
  stack,
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  stack?: CardStack
  status: DiffStatus
  onMouseEnter: (card: DeckCard, rect: DOMRect) => void
  onMouseLeave: () => void
}) {
  if (!stack) {
    return (
      <div className={`min-h-16 rounded-lg border p-2 ${statusClasses(status, false)}`}>
        <span className="text-xs">Not present</span>
      </div>
    )
  }

  const { card, quantity } = stack
  return (
    <div
      className={`group flex min-h-16 items-center gap-3 rounded-lg border p-2 transition hover:bg-accent/50 ${statusClasses(status, true)}`}
      onMouseEnter={(e) => onMouseEnter(card, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onMouseLeave}
    >
      <span className="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground">{quantity}</span>
      {primaryCardImage(card) && (
        <div className="relative shrink-0">
          <CardFaceImage card={card} alt="" className="h-10 rounded border border-border/50" />
          {(card.finish === "foil" || card.finish === "etched") && (
            <div className="absolute inset-0 pointer-events-none foil-overlay rounded" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <ManaText text={card.name} className="truncate text-sm font-medium" />
          <ManaText text={card.mana_cost} className="shrink-0 text-xs text-muted-foreground" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
            {card.set_code ?? "set"} {card.collector_number ?? ""}
          </Badge>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {finishLabel(card.finish)}
          </Badge>
          {normalizeCardZone(card.zone) !== DEFAULT_CARD_ZONE_ID && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
              {getZoneLabel(card.zone)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

export function DeckDiffView({ before, after }: DeckDiffViewProps) {
  const [changesOnly, setChangesOnly] = useState(true)
  const [hoverPreview, setHoverPreview] = useState<{ card: DeckCard; x: number; y: number } | null>(null)

  const allEntries = useMemo(() => buildDiff(before.cards, after.cards), [before.cards, after.cards])
  const entries = changesOnly ? allEntries.filter(entry => entry.status !== "unchanged") : allEntries
  const changedCount = allEntries.filter(entry => entry.status !== "unchanged").length
  const grouped = useMemo(() => {
    const groups = new Map<string, DiffEntry[]>()
    for (const entry of entries) {
      const group = groups.get(entry.typeGroup) ?? []
      group.push(entry)
      groups.set(entry.typeGroup, group)
    }
    return Array.from(groups.entries()).sort(([ga], [gb]) => typeGroupCompare(ga, gb))
  }, [entries])

  const showHoverPreview = (card: DeckCard, rect: DOMRect) => {
    if (primaryCardImage(card)) {
      const previewWidth = 256 + 8 // w-64 + gap
      const x = window.innerWidth - rect.right >= previewWidth
        ? rect.right + 8
        : rect.left - previewWidth
      setHoverPreview({ card, x, y: rect.top + rect.height / 2 })
    }
  }

  const hideHoverPreview = () => setHoverPreview(null)

  return (
    <div className="relative space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Deck diff</div>
          <div className="text-xs text-muted-foreground">
            {changedCount} changed rows across {allEntries.length} exact print/finish stacks
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={changesOnly}
            onChange={(event) => setChangesOnly(event.target.checked)}
          />
          Show changes only
        </label>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-3 rounded-lg border border-border bg-background/60 p-3 text-xs font-medium text-muted-foreground">
        <div className="truncate">{before.label}</div>
        <div className="truncate">{after.label}</div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          No card changes between these decklists.
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, groupEntries]) => (
            <section key={group} className="space-y-2">
              <h3 className="border-b border-border pb-1 text-sm font-semibold text-foreground">
                {group}
                <span className="ml-2 font-normal text-muted-foreground">({groupEntries.length})</span>
              </h3>
              <div className="space-y-2">
                {groupEntries.map(entry => (
                  <div key={entry.key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span>{statusLabel(entry.status)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                      <CardCell
                        stack={entry.before}
                        status={entry.status}
                        onMouseEnter={showHoverPreview}
                        onMouseLeave={hideHoverPreview}
                      />
                      <CardCell
                        stack={entry.after}
                        status={entry.status}
                        onMouseEnter={showHoverPreview}
                        onMouseLeave={hideHoverPreview}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {hoverPreview && createPortal(
        <div
          className="pointer-events-none fixed z-[100] -translate-y-1/2 drop-shadow-2xl"
          style={{ left: hoverPreview.x, top: hoverPreview.y }}
        >
          <CardArtPreview card={hoverPreview.card} />
        </div>,
        document.body
      )}
    </div>
  )
}
