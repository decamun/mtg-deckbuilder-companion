"use client"

import { useState } from "react"
import { FlipHorizontal2, Loader2 } from "lucide-react"
import type { DeckCard, DeckCardFace } from "@/lib/types"
import { primaryDeckCardImage } from "./deck-workspace-pure"

function getDeckCardFaces(card: DeckCard): DeckCardFace[] {
  if (card.face_images?.length) return card.face_images
  if (card.image_url) return [{ name: card.name, normal: card.image_url }]
  return []
}

function activeDeckFaceAt(faces: DeckCardFace[], faceIndex: number): DeckCardFace | undefined {
  if (!faces.length) return undefined
  const i = ((faceIndex % faces.length) + faces.length) % faces.length
  return faces[i]
}

export function CardThumbnail({
  card,
  className,
  imageClassName,
  overlayClassName = "rounded-xl",
  faceIndex = 0,
}: {
  card: DeckCard
  className?: string
  imageClassName: string
  overlayClassName?: string
  /** Which face to show when the card has {@link DeckCard.face_images}. */
  faceIndex?: number
}) {
  const faces = getDeckCardFaces(card)
  const activeFace = activeDeckFaceAt(faces, faceIndex)
  const imageUrl = activeFace?.normal ?? activeFace?.small ?? primaryDeckCardImage(card)
  if (!imageUrl) {
    return (
      <div
        className={`${className ?? ""} flex aspect-[5/7] items-center justify-center rounded-xl border border-border/40 bg-card/50`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    )
  }

  const alt = activeFace?.name ?? card.name

  return (
    <div className={`relative ${className ?? ""}`}>
      <img src={imageUrl} alt={alt} className={imageClassName} draggable={false} />
      {(card.finish === "foil" || card.finish === "etched") && (
        <div className={`absolute inset-0 pointer-events-none foil-overlay ${overlayClassName}`} />
      )}
    </div>
  )
}

/** Visual / stack decklist tile: multi-face cards get the same flip behavior as the click-to-preview overlay, icon-only. */
export function DeckBuilderVisualCardThumbnail({
  card,
  className,
  thumbnailClassName,
  imageClassName,
  overlayClassName = "rounded-xl",
}: {
  card: DeckCard
  className?: string
  /** Passed to {@link CardThumbnail} (e.g. `h-full w-full` when the tile has a fixed aspect box). */
  thumbnailClassName?: string
  imageClassName: string
  overlayClassName?: string
}) {
  const [faceIndex, setFaceIndex] = useState(0)
  const faces = getDeckCardFaces(card)
  const canFlip = faces.length > 1

  const nextName = faces[(faceIndex + 1) % faces.length]?.name ?? "other face"

  return (
    <div className={`relative ${className ?? ""}`}>
      <CardThumbnail
        card={card}
        faceIndex={faceIndex}
        className={thumbnailClassName}
        imageClassName={imageClassName}
        overlayClassName={overlayClassName}
      />
      {canFlip && (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 z-[14] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:bg-accent hover:text-accent-foreground"
          aria-label={`Flip to ${nextName}`}
          onClick={(e) => {
            e.stopPropagation()
            setFaceIndex((i) => (i + 1) % faces.length)
          }}
        >
          <FlipHorizontal2 className="h-4 w-4" aria-hidden />
        </button>
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
  const faces = getDeckCardFaces(card)
  const activeFace = activeDeckFaceAt(faces, faceIndex)
  const activeImage = activeFace?.normal ?? activeFace?.small
  const canFlip = faces.length > 1

  return (
    <div className={`relative ${className ?? ""}`}>
      {activeImage ? (
        <>
          <img src={activeImage} alt={activeFace?.name ?? card.name} className={imageClassName} draggable={false} />
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
