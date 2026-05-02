"use client"

import { useEffect, useState } from "react"
import { getCard, getCardFaceImages, type ScryfallCard } from "@/lib/scryfall"

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

  const faces = getCardFaceImages(card)
  const widthClass = faces.length > 1 ? "w-[280px]" : "w-[140px]"
  if (faces.length === 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/40 text-xs text-foreground border border-border align-middle">
        {card.name}
      </span>
    )
  }

  return (
    <span className="relative inline-block align-middle mx-0.5 my-1">
      <button
        type="button"
        title={card.name}
        onClick={() => setEnlarged(v => !v)}
        className={`inline-flex cursor-pointer gap-1 ${widthClass} border-0 bg-transparent p-0`}
      >
        {faces.map((face, index) => (
          <img
            key={`${face.name}-${index}`}
            src={face.normal ?? face.small}
            alt={face.name}
            className="min-w-0 flex-1 rounded-md border border-border shadow transition-shadow hover:ring-2 hover:ring-primary/50"
          />
        ))}
      </button>
      {enlarged && (
        <button
          type="button"
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-50 flex w-full items-center justify-center bg-black/70 backdrop-blur-sm cursor-zoom-out border-0 p-0"
          aria-label="Close preview"
        >
          <span className="flex max-w-[95vw] gap-3">
            {faces.map((face, index) => (
              <img
                key={`${face.name}-${index}`}
                src={face.normal ?? face.small}
                alt={face.name}
                className="max-h-[90vh] min-w-0 rounded-xl shadow-2xl"
              />
            ))}
          </span>
        </button>
      )}
    </span>
  )
}
