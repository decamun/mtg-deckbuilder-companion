"use client"

export type DeckTab = "decklist" | "primer" | "versions"

interface Props {
  tab: DeckTab
  onChange: (t: DeckTab) => void
}

const TABS: { key: DeckTab; label: string }[] = [
  { key: "decklist", label: "Decklist" },
  { key: "primer", label: "Primer" },
  { key: "versions", label: "Versions" },
]

export function DeckTabs({ tab, onChange }: Props) {
  return (
    <nav className="container mx-auto px-6 pt-4 flex gap-6 text-sm font-medium border-b border-border/40">
      {TABS.map(t => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`pb-2 -mb-px border-b-2 transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
