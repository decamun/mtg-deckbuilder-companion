"use client"

import { useState } from "react"
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

export function UnnamedVersionsGroup({ rows, isOwner, knownTags, onView, onToggleBookmark, onToggleTag, onAddTag, onRevert }: Props) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null

  const earliest = new Date(rows[rows.length - 1].created_at)
  const latest = new Date(rows[0].created_at)
  const sameDay = earliest.toDateString() === latest.toDateString()
  const range = sameDay
    ? earliest.toLocaleDateString()
    : `${earliest.toLocaleDateString()} – ${latest.toLocaleDateString()}`

  return (
    <div className="border border-dashed border-border/60 rounded">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {rows.length} edit{rows.length === 1 ? "" : "s"} · {range}
      </button>
      {open && (
        <div className="space-y-1 px-2 pb-2">
          {rows.map(r => (
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
}
