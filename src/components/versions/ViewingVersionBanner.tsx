"use client"

import { Button } from "@/components/ui/button"

interface Props {
  versionLabel: string
  isOwner: boolean
  onRevert: () => void
  onBackToLatest: () => void
}

export function ViewingVersionBanner({ versionLabel, isOwner, onRevert, onBackToLatest }: Props) {
  return (
    <div className="sticky top-0 z-50 bg-amber-500/95 text-amber-950 border-b border-amber-700 shadow">
      <div className="container mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">
          You&apos;re viewing a previous version: <span className="font-bold">{versionLabel}</span>
        </span>
        <span className="opacity-80 hidden sm:inline">— this is read-only.</span>
        <div className="ml-auto flex gap-2">
          {isOwner && (
            <Button size="sm" variant="default" onClick={onRevert} className="bg-amber-900 text-amber-50 hover:bg-amber-800">
              Revert to this version
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onBackToLatest} className="text-amber-950 hover:bg-amber-400">
            Back to latest
          </Button>
        </div>
      </div>
    </div>
  )
}
