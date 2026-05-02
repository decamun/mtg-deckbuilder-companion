"use client"

import { useRef, useState } from "react"
import { getCardFaceImages, type CardFaceImage } from "@/lib/scryfall"

interface ScryfallNamedResult {
  id: string
  name: string
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
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(async () => {
      const result = await fetchCardByName(name)
      setEntry(result)
      setVisible(true)
    }, 120)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setVisible(false)
  }

  return (
    <span className="relative inline-block">
      <strong
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

      {visible && entry?.found && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2"
          style={{ width: entry.faces.length > 1 ? 400 : 200 }}
        >
          <span
            onClick={() => setEnlarged(true)}
            className="pointer-events-auto flex gap-2"
          >
            {entry.faces.map((face, index) => (
              <img
                key={`${face.name}-${index}`}
                src={face.normal ?? face.small}
                alt={face.name}
                className="min-w-0 flex-1 rounded-xl shadow-2xl ring-1 ring-border"
              />
            ))}
          </span>
        </span>
      )}

      {enlarged && entry?.found && (
        <span
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/70 backdrop-blur-sm"
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
        </span>
      )}
    </span>
  )
}
