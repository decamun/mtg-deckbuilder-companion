"use client"

import { useEffect, useState } from "react"
import { getCard, getCardFaceImages, type ScryfallCard } from "@/lib/scryfall"

const cache = new Map<string, ScryfallCard>()

export type CardEmbedVariant = "inline" | "block"

export function CardEmbed({
  printingScryfallId,
  variant = "inline",
}: {
  printingScryfallId: string
  variant?: CardEmbedVariant
}) {
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
      <span className="inline font-semibold text-muted-foreground">
        Card…
      </span>
    )
  }

  const faces = getCardFaceImages(card)

  if (faces.length === 0) {
    return (
      <span className="inline font-semibold text-foreground">
        {card.name}
      </span>
    )
  }

  if (variant === "block") {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <button
          type="button"
          title={card.name}
          onClick={() => setEnlarged(v => !v)}
          className="flex max-w-[min(100%,22rem)] cursor-pointer gap-2 border-0 bg-transparent p-0"
        >
          {faces.map((face, index) => (
            <img
              key={`${face.name}-${index}`}
              src={face.normal ?? face.small}
              alt={face.name}
              className="min-w-0 flex-1 rounded-lg border border-border object-contain shadow-md transition-shadow hover:ring-2 hover:ring-primary/50"
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
      </div>
    )
  }

  return (
    <span className="group/card-embed relative inline align-baseline">
      <button
        type="button"
        title={`${card.name} — click to enlarge`}
        onClick={() => setEnlarged(v => !v)}
        className="inline border-0 bg-transparent p-0 font-semibold text-foreground underline decoration-dotted decoration-primary/60 underline-offset-[3px] cursor-pointer hover:text-primary"
      >
        {card.name}
      </button>
      <span
        className="pointer-events-none absolute bottom-[calc(100%-0.25rem)] left-1/2 z-40 w-max max-w-[min(90vw,18rem)] -translate-x-1/2 opacity-0 shadow-xl transition-opacity duration-150 group-hover/card-embed:opacity-100 [@media(hover:none)]:hidden"
        aria-hidden
      >
        <span className="flex gap-1 rounded-lg border border-border bg-popover p-1.5">
          {faces.map((face, index) => (
            <img
              key={`${face.name}-${index}`}
              src={face.normal ?? face.small}
              alt=""
              className="max-h-52 min-w-0 flex-1 rounded-md object-contain"
            />
          ))}
        </span>
      </span>
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
