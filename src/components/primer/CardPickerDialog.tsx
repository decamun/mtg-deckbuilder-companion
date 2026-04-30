"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useDebounce } from "@/hooks/use-debounce"
import { searchCards, getPrintingsByOracleId, type ScryfallCard, type ScryfallPrinting } from "@/lib/scryfall"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPicked: (printingScryfallId: string) => void
}

function CardPickerDialogContent({ onOpenChange, onPicked }: Omit<Props, "open">) {
  const [query, setQuery] = useState("")
  const debounced = useDebounce(query, 300)
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [picked, setPicked] = useState<ScryfallCard | null>(null)
  const [printings, setPrintings] = useState<ScryfallPrinting[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [printingId, setPrintingId] = useState<string | null>(null)

  useEffect(() => {
    if (debounced.length > 1) {
      void searchCards(debounced).then(setResults)
    }
  }, [debounced])

  const displayedResults = debounced.length > 1 ? results : []

  const handlePickCard = (card: ScryfallCard) => {
    setPicked(card)
    setPrintings([])
    setPrintingId(card.id)
    if (!card.oracle_id) return
    setLoadingPrintings(true)
    void getPrintingsByOracleId(card.oracle_id).then(p => {
      setPrintings(p)
      setPrintingId(p[0]?.id ?? card.id)
      setLoadingPrintings(false)
    })
  }

  const insert = () => {
    if (printingId) {
      onPicked(printingId)
      onOpenChange(false)
    }
  }

  return (
      <DialogContent className="bg-card border border-border text-foreground sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{picked ? `Pick a printing — ${picked.name}` : "Embed a Card"}</DialogTitle>
        </DialogHeader>

        {!picked && (
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Search Scryfall…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-background/50 border-border"
            />
            <div className="max-h-72 overflow-y-auto rounded border border-border">
              {displayedResults.slice(0, 20).map(c => (
                <button
                  key={c.id}
                  onClick={() => handlePickCard(c)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-accent/50"
                >
                  {c.image_uris?.small && (
                    <img src={c.image_uris.small} alt="" className="w-7 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.type_line}</div>
                  </div>
                </button>
              ))}
              {displayedResults.length === 0 && query.length > 1 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
              )}
            </div>
          </div>
        )}

        {picked && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>← Pick a different card</Button>
            {loadingPrintings && <div className="text-sm text-muted-foreground">Loading printings…</div>}
            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
              {(printings.length > 0 ? printings : []).map(p => {
                const active = printingId === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPrintingId(p.id)}
                    className={`rounded border-2 p-1 text-left transition-colors ${
                      active ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                  >
                    {p.image_uris?.small && (
                      <img src={p.image_uris.small} alt="" className="w-full rounded" />
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1 truncate">
                      {p.set?.toUpperCase()} · {p.collector_number}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={insert} disabled={!printingId}>Insert</Button>
        </DialogFooter>
      </DialogContent>
  )
}

export function CardPickerDialog({ open, onOpenChange, onPicked }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <CardPickerDialogContent
          onOpenChange={onOpenChange}
          onPicked={onPicked}
        />
      )}
    </Dialog>
  )
}
