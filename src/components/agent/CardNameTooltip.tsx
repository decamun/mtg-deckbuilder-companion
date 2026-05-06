"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getCardFaceImages, type CardFaceImage } from "@/lib/scryfall"

interface ScryfallNamedResult {
  id: string
  name: string
  layout?: string
  image_uris?: { normal?: string; small?: string }
  card_faces?: Array<{ name?: string; image_uris?: { normal?: string; small?: string } }>
}

type CacheEntry = { found: false } | { found: true; faces: CardFaceImage[]; cardName: string }

const nameCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<CacheEntry>>()

async function fetchCardByName(name: string): Promise<CacheEntry> {
  const key = name.toLowerCase()
  const cached = nameCache.get(key)
  if (cached) return cached

  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<CacheEntry> => {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
      )
      if (!res.ok) {
        const entry: CacheEntry = { found: false }
        nameCache.set(key, entry)
        return entry
      }
      const card = (await res.json()) as ScryfallNamedResult
      const faces = getCardFaceImages(card)
      const entry: CacheEntry = faces.length > 0
        ? { found: true, faces, cardName: card.name }
        : { found: false }
      nameCache.set(key, entry)
      return entry
    } catch {
      const entry: CacheEntry = { found: false }
      nameCache.set(key, entry)
      return entry
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}

export function CardNameTooltip({ name }: { name: string }) {
  const [entry, setEntry] = useState<CacheEntry | null>(() => {
    const key = name.toLowerCase()
    return nameCache.get(key) ?? null
  })
  const [visible, setVisible] = useState(false)
  const [enlarged, setEnlarged] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(async () => {
      const result = await fetchCardByName(name)
      setEntry(result)
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
      }
      setVisible(true)
    }, 120)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setVisible(false)
  }

  const tooltipWidth = entry?.found && entry.faces.length > 1 ? 400 : 200

  return (
    <span className="relative inline-block">
      <strong
        ref={triggerRef as React.RefObject<HTMLElement>}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={
          entry?.found
            ? "cursor-pointer text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
            : undefined
        }
      >
        {name}
      </strong>

      {visible && entry?.found && tooltipPos &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[200]"
            style={{
              width: tooltipWidth,
              left: tooltipPos.x - tooltipWidth / 2,
              top: tooltipPos.y - 8,
              transform: "translateY(-100%)",
            }}
          >
            <button
              type="button"
              onClick={() => setEnlarged(true)}
              className="pointer-events-auto flex w-full gap-2 border-0 bg-transparent p-0"
              aria-label={`Enlarge ${entry.cardName}`}
            >
              {entry.faces.map((face, index) => (
                <img
                  key={`${face.name}-${index}`}
                  src={face.normal ?? face.small}
                  alt={face.name}
                  className="min-w-0 flex-1 rounded-xl shadow-2xl ring-1 ring-border"
                />
              ))}
            </button>
          </span>,
          document.body
        )}

      {enlarged && entry?.found &&
        createPortal(
          <button
            type="button"
            onClick={() => setEnlarged(false)}
            className="fixed inset-0 z-[60] flex w-full cursor-zoom-out items-center justify-center bg-black/70 backdrop-blur-sm border-0 p-0"
            aria-label="Close preview"
          >
            <span className="flex max-w-[95vw] gap-3">
              {entry.faces.map((face, index) => (
                <img
                  key={`${face.name}-${index}`}
                  src={face.normal ?? face.small}
                  alt={face.name}
                  className="max-h-[90vh] min-w-0 rounded-xl shadow-2xl"
                />
              ))}
            </span>
          </button>,
          document.body
        )}
    </span>
  )
}
