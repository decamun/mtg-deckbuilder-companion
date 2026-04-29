"use client"

import { useEffect, useState } from "react"
import { getCard, type ScryfallCard } from "@/lib/scryfall"

const cache = new Map<string, ScryfallCard>()

export function CardEmbed({ printingScryfallId }: { printingScryfallId: string }) {
  const cachedCard = cache.get(printingScryfallId) ?? null
  const [fetchedCard, setFetchedCard] = useState<ScryfallCard | null>(null)
  const [enlarged, setEnlarged] = useState(false)

  useEffect(() => {
    if (cache.has(printingScryfallId)) {
      return
    }
    let alive = true
    void getCard(printingScryfallId).then(c => {
      if (!alive || !c) return
      cache.set(printingScryfallId, c)
      setFetchedCard(c)
    })
    return () => { alive = false }
  }, [printingScryfallId])

  const card = cachedCard ?? fetchedCard

  if (!card) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/40 text-xs text-muted-foreground border border-border align-middle">
        loading…
      </span>
    )
  }

  const img = card.image_uris?.normal ?? card.image_uris?.small
  if (!img) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/40 text-xs text-foreground border border-border align-middle">
        {card.name}
      </span>
    )
  }

  return (
    <span className="relative inline-block align-middle mx-0.5 my-1">
      <img
        src={img}
        alt={card.name}
        title={card.name}
        onClick={() => setEnlarged(v => !v)}
        className="inline-block w-[140px] rounded-md border border-border shadow cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
      />
      {enlarged && (
        <span
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-zoom-out"
        >
          <img src={img} alt={card.name} className="max-h-[90vh] rounded-xl shadow-2xl" />
        </span>
      )}
    </span>
  )
}
