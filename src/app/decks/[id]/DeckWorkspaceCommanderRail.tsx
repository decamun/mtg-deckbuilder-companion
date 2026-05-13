"use client"

import { Crown, Loader2 } from "lucide-react"
import type { DeckCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CardThumbnail } from "./deck-workspace-card-media"
import { primaryDeckCardImage } from "./deck-workspace-pure"

export type DeckWorkspaceCommanderRailProps = {
  className?: string
  commanderCards: DeckCard[]
  showClickedPreview: (c: DeckCard, groupName: string) => void
  onDeckCardRulesPreviewHover: (card: DeckCard | null) => void
}

export function DeckWorkspaceCommanderRail({
  className,
  commanderCards,
  showClickedPreview,
  onDeckCardRulesPreviewHover,
}: DeckWorkspaceCommanderRailProps) {
  if (commanderCards.length === 0) return null

  return (
    <div className={cn("pointer-events-auto hidden min-[1180px]:flex flex-col items-end gap-2", className)}>
      {commanderCards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="group flex w-[min(100%,15rem)] flex-col overflow-hidden rounded-xl border border-yellow-400/50 bg-white text-left text-foreground shadow-md transition hover:border-yellow-300 sm:max-w-[15rem]"
          onClick={() => showClickedPreview(c, "Commander")}
          onMouseEnter={() => onDeckCardRulesPreviewHover(c)}
          onMouseLeave={() => onDeckCardRulesPreviewHover(null)}
        >
          <div className="relative w-full shrink-0 border-b border-yellow-400/20 bg-zinc-50/80">
            {primaryDeckCardImage(c) ? (
              <CardThumbnail
                card={c}
                className="w-full"
                imageClassName="h-32 w-full object-cover object-center sm:h-36"
                overlayClassName="rounded-none"
              />
            ) : (
              <div className="flex h-32 items-center justify-center sm:h-36">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1 p-2.5 pt-2">
            <div className="inline-flex items-center gap-1 rounded-full bg-yellow-400/90 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-950">
              <Crown className="h-3 w-3" /> Commander
            </div>
            <div className="truncate text-sm font-semibold leading-tight text-foreground">{c.name}</div>
            {c.type_line ? <div className="line-clamp-2 text-xs text-muted-foreground">{c.type_line}</div> : null}
          </div>
        </button>
      ))}
    </div>
  )
}
