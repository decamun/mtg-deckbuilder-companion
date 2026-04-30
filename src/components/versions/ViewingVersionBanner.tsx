"use client"

import { Button } from "@/components/ui/button"
import { GitCompare, RotateCcw, X } from "lucide-react"

interface Props {
  versionLabel: string
  isOwner: boolean
  onCompareLatest: () => void
  onRevert: () => void
  onBackToLatest: () => void
}

export function ViewingVersionBanner({ versionLabel, isOwner, onCompareLatest, onRevert, onBackToLatest }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-600/60 bg-amber-500 px-2 py-1 text-amber-950 shadow-sm">
      <div className="min-w-0 text-left">
        <div className="text-[10px] font-bold uppercase leading-none tracking-wide">Viewing version</div>
        <div className="max-w-36 truncate text-xs font-medium" title={versionLabel}>{versionLabel}</div>
      </div>
      <div className="flex items-center gap-1 border-l border-amber-700/40 pl-2">
        <Button size="icon-xs" variant="ghost" onClick={onCompareLatest} title="Diff with latest" className="text-amber-950 hover:bg-amber-400">
          <GitCompare className="w-3.5 h-3.5" />
          <span className="sr-only">Diff with latest</span>
        </Button>
        {isOwner && (
          <Button size="icon-xs" variant="ghost" onClick={onRevert} title="Revert to this version" className="text-amber-950 hover:bg-amber-400">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="sr-only">Revert to this version</span>
          </Button>
        )}
        <Button size="icon-xs" variant="ghost" onClick={onBackToLatest} title="Back to latest" className="text-amber-950 hover:bg-amber-400">
          <X className="w-3.5 h-3.5" />
          <span className="sr-only">Back to latest</span>
        </Button>
      </div>
    </div>
  )
}
