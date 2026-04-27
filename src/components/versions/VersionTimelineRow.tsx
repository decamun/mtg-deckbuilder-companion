"use client"

import { Bookmark, BookmarkCheck, Eye, RotateCcw } from "lucide-react"
import type { DeckVersionRow } from "@/lib/versions"

interface Props {
  row: DeckVersionRow
  isOwner: boolean
  onView: () => void
  onToggleBookmark: () => void
  onRevert: () => void
}

export function VersionTimelineRow({ row, isOwner, onView, onToggleBookmark, onRevert }: Props) {
  const date = new Date(row.created_at)
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded border border-border/60 bg-card/40 hover:bg-card/60">
      <button onClick={onView} className="flex-1 text-left min-w-0">
        <div className="font-medium truncate">{row.name ?? (row.change_summary || "Edit")}</div>
        <div className="text-xs text-muted-foreground truncate">
          {row.name && row.change_summary ? `${row.change_summary} · ` : ""}
          {date.toLocaleString()}
        </div>
      </button>
      <button
        onClick={onView}
        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="View this version"
      >
        <Eye className="w-4 h-4" />
      </button>
      {isOwner && row.name && (
        <button
          onClick={onToggleBookmark}
          className={`p-1.5 rounded hover:bg-accent ${row.is_bookmarked ? "text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
          title={row.is_bookmarked ? "Unbookmark" : "Bookmark"}
        >
          {row.is_bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      )}
      {isOwner && (
        <button
          onClick={onRevert}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Revert to this version"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
