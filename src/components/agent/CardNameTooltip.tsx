"use client"

import { useRef, useState } from "react"

interface ScryfallNamedResult {
  id: string
  name: string
  image_uris?: { normal: string; small: string }
  card_faces?: Array<{ image_uris?: { normal: string; small: string } }>
}

type CacheEntry = { found: false } | { found: true; imageUrl: string; cardName: string }

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
      const imageUrl =
        card.image_uris?.normal ??
        card.image_uris?.small ??
        card.card_faces?.[0]?.image_uris?.normal ??
        card.card_faces?.[0]?.image_uris?.small ??
        null
      const entry: CacheEntry = imageUrl
        ? { found: true, imageUrl, cardName: card.name }
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
          style={{ width: 200 }}
        >
          <img
            src={entry.imageUrl}
            alt={entry.cardName}
            onClick={() => setEnlarged(true)}
            className="pointer-events-auto w-full rounded-xl shadow-2xl ring-1 ring-border"
          />
        </span>
      )}

      {enlarged && entry?.found && (
        <span
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <img
            src={entry.imageUrl}
            alt={entry.cardName}
            className="max-h-[90vh] rounded-xl shadow-2xl"
          />
        </span>
      )}
    </span>
  )
}
