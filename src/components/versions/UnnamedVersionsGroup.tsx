"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { DeckVersionRow } from "@/lib/versions"
import { VersionTimelineRow } from "./VersionTimelineRow"

interface Props {
  rows: DeckVersionRow[]
  isOwner: boolean
  knownTags: string[]
  onView: (id: string) => void
  onToggleBookmark: (row: DeckVersionRow) => void
  onToggleTag: (row: DeckVersionRow, tag: string) => void
  onAddTag: (row: DeckVersionRow) => void
  onRevert: (id: string) => void
}

function localHourKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  return `${y}-${mo}-${da}T${h}`
}

function startOfLocalHourFromKey(key: string): Date {
  const [datePart, hourPart] = key.split("T")
  const [y, mo, da] = datePart.split("-").map(Number)
  const h = Number(hourPart)
  return new Date(y, mo - 1, da, h, 0, 0, 0)
}

/** Preserves `rows` order (newest-first from the API) while bucketing by local calendar hour. */
function groupRowsByLocalHour(rows: DeckVersionRow[]): { key: string; startOfHour: Date; rows: DeckVersionRow[] }[] {
  const keyOrder: string[] = []
  const byKey = new Map<string, DeckVersionRow[]>()
  for (const r of rows) {
    const key = localHourKey(r.created_at)
    if (!byKey.has(key)) {
      byKey.set(key, [])
      keyOrder.push(key)
    }
    byKey.get(key)!.push(r)
  }
  return keyOrder.map(key => ({
    key,
    startOfHour: startOfLocalHourFromKey(key),
    rows: byKey.get(key)!,
  }))
}

export function UnnamedVersionsGroup({ rows, isOwner, knownTags, onView, onToggleBookmark, onToggleTag, onAddTag, onRevert }: Props) {
  const hourChunks = useMemo(() => groupRowsByLocalHour(rows), [rows])
  const [openHours, setOpenHours] = useState<Record<string, boolean>>({})

  if (rows.length === 0) return null

  const toggleHour = (key: string) => {
    setOpenHours(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-2">
      {hourChunks.map(({ key, startOfHour, rows: hourRows }) => {
        const open = !!openHours[key]
        const heading = startOfHour.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
        return (
          <div key={key} className="border border-dashed border-border/60 rounded">
            <button
              type="button"
              onClick={() => toggleHour(key)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <span className="text-left min-w-0">
                {hourRows.length} edit{hourRows.length === 1 ? "" : "s"} · {heading}
              </span>
            </button>
            {open && (
              <div className="space-y-1 px-2 pb-2">
                {hourRows.map(r => (
                  <VersionTimelineRow
                    key={r.id}
                    row={r}
                    isOwner={isOwner}
                    knownTags={knownTags}
                    onView={() => onView(r.id)}
                    onToggleBookmark={() => onToggleBookmark(r)}
                    onToggleTag={(tag) => onToggleTag(r, tag)}
                    onAddTag={() => onAddTag(r)}
                    onRevert={() => onRevert(r.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
