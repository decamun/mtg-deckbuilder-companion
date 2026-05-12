"use client"

import { Loader2 } from "lucide-react"
import type { DeckCard } from "@/lib/types"
import { primaryDeckCardImage } from "./deck-workspace-pure"

export function CardThumbnail({
  card,
  className,
  imageClassName,
  overlayClassName = "rounded-xl",
}: {
  card: DeckCard
  className?: string
  imageClassName: string
  overlayClassName?: string
}) {
  const imageUrl = primaryDeckCardImage(card)
  if (!imageUrl) {
    return (
      <div
        className={`${className ?? ""} flex aspect-[5/7] items-center justify-center rounded-xl border border-border/40 bg-card/50`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    )
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <img src={imageUrl} alt={card.name} className={imageClassName} draggable={false} />
      {(card.finish === "foil" || card.finish === "etched") && (
        <div className={`absolute inset-0 pointer-events-none foil-overlay ${overlayClassName}`} />
      )}
    </div>
  )
}

export function CardArt({
  card,
  className,
  imageClassName = "w-full rounded-xl border border-border/50 shadow-2xl",
  faceIndex = 0,
  onFlip,
}: {
  card: DeckCard
  className?: string
  imageClassName?: string
  faceIndex?: number
  onFlip?: () => void
}) {
  const faces = card.face_images?.length
    ? card.face_images
    : card.image_url
      ? [{ name: card.name, normal: card.image_url }]
      : []
  const activeFace = faces[faceIndex] ?? faces[0]
  const activeImage = activeFace?.normal ?? activeFace?.small
  const canFlip = faces.length > 1

  return (
    <div className={`relative ${className ?? ""}`}>
      {activeImage ? (
        <>
          <img src={activeImage} alt={activeFace.name} className={imageClassName} draggable={false} />
          {(card.finish === "foil" || card.finish === "etched") && (
            <div className="absolute inset-0 pointer-events-none foil-overlay rounded-xl" />
          )}
          {canFlip && onFlip && (
            <button
              type="button"
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition hover:bg-accent hover:text-accent-foreground"
              onClick={(event) => {
                event.stopPropagation()
                onFlip()
              }}
            >
              Flip to {faces[(faceIndex + 1) % faces.length]?.name ?? "back"}
            </button>
          )}
        </>
      ) : (
        <div className="aspect-[5/7] w-full rounded-xl border border-border/40 bg-card/50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
        </div>
      )}
    </div>
  )
}
