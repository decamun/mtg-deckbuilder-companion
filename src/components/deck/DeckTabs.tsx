"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type DeckTab = "decklist" | "boards" | "primer" | "versions"

interface Props {
  tab: DeckTab
  onChange: (t: DeckTab) => void
  afterTabs?: ReactNode
  className?: string
}

const TABS: { key: DeckTab; label: string }[] = [
  { key: "decklist", label: "Decklist" },
  { key: "boards", label: "Boards" },
  { key: "primer", label: "Primer" },
  { key: "versions", label: "Versions" },
]

export function DeckTabs({ tab, onChange, afterTabs, className }: Props) {
  return (
    <nav
      className={cn(
        "w-full min-w-0 border-b border-border bg-background/80 px-4 pt-4 text-sm font-medium backdrop-blur-xl sm:px-6",
        className
      )}
    >
      {/*
        Overflow: tab row scrolls horizontally on very narrow widths; from `sm`, tabs can wrap with the banner.
      */}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-2">
        <div className="-mx-4 flex min-w-0 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-0.5 [scrollbar-width:thin] sm:mx-0 sm:mb-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChange(t.key)}
                className={`shrink-0 whitespace-nowrap pb-2 -mb-px border-b-2 transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        {afterTabs && <div className="w-full min-w-0 pb-1 sm:w-auto">{afterTabs}</div>}
      </div>
    </nav>
  )
}
