"use client"

import { Bookmark, BookmarkCheck, Eye, RotateCcw, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DeckVersionRow } from "@/lib/versions"

interface Props {
  row: DeckVersionRow
  isOwner: boolean
  knownTags: string[]
  onView: () => void
  onToggleBookmark: () => void
  onToggleTag: (tag: string) => void
  onAddTag: () => void
  onRevert: () => void
}

export function VersionTimelineRow({ row, isOwner, knownTags, onView, onToggleBookmark, onToggleTag, onAddTag, onRevert }: Props) {
  const date = new Date(row.created_at)
  const tags = row.tags ?? []
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded border border-border/60 bg-card/40 hover:bg-card/60">
      <button onClick={onView} className="flex-1 text-left min-w-0">
        <div className="font-medium truncate">{row.name ?? (row.change_summary || "Edit")}</div>
        <div className="text-xs text-muted-foreground truncate">
          {row.name && row.change_summary ? `${row.change_summary} · ` : ""}
          {date.toLocaleString()}
        </div>
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map(tag => (
              <Badge key={tag} variant="outline" className="px-1.5 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
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
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="ghost" title="Mark as" className="text-muted-foreground hover:text-foreground">
                  <Tag className="w-4 h-4" />
                  <span className="sr-only">Mark as</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48 bg-popover border-border text-foreground">
              <DropdownMenuItem onClick={() => onToggleTag("paper-build")}>
                {tags.includes("paper-build") ? "Unmark" : "Mark"} paper-build
              </DropdownMenuItem>
              {knownTags.filter(tag => tag !== "paper-build").length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Known tags</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44 bg-popover border-border text-foreground">
                      {knownTags.filter(tag => tag !== "paper-build").map(tag => (
                        <DropdownMenuItem key={tag} onClick={() => onToggleTag(tag)}>
                          {tags.includes(tag) ? "Remove" : "Add"} {tag}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAddTag}>Add custom tag...</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onRevert}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Revert to this version"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}
