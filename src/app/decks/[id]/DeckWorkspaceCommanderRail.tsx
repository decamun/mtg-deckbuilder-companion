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
    <div className={cn("pointer-events-auto hidden min-[1180px]:flex flex-col items-end gap-3", className)}>
      {commanderCards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="group flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-yellow-400/50 bg-white p-2 text-left text-foreground transition hover:border-yellow-300 sm:w-[min(100%,16rem)] sm:max-w-[16rem]"
          onClick={() => showClickedPreview(c, "Commander")}
          onMouseEnter={() => onDeckCardRulesPreviewHover(c)}
          onMouseLeave={() => onDeckCardRulesPreviewHover(null)}
        >
          {primaryDeckCardImage(c) ? (
            <CardThumbnail card={c} className="h-24 shrink-0" imageClassName="h-24 w-auto rounded-lg border border-border/60" overlayClassName="rounded-lg" />
          ) : (
            <div className="flex aspect-[5/7] h-24 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-zinc-100">
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
  )
}
