"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCardsCollection, ScryfallCard } from "@/lib/scryfall"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"

const PENDING_COMMANDER_KEY = "idlebrew:pendingCommander"

function toEDHRECSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

async function fetchEDHRECCards(
  commanderName: string
): Promise<{ name: string; quantity: number }[]> {
  try {
    const slug = toEDHRECSlug(commanderName)
    const res = await fetch(`/api/edhrec/${encodeURIComponent(slug)}`)
    if (!res.ok) return []
    const data = await res.json()
    const decklistText = data.decklist ?? data.deck?.decklist
    if (!decklistText || typeof decklistText !== "string") return []
    return decklistText
      .split("\n")
      .flatMap((line: string) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("//")) return []
        const match = trimmed.match(/^(\d+)\s+(.+)$/)
        if (match) return [{ quantity: parseInt(match[1]), name: match[2].trim() }]
        return [{ quantity: 1, name: trimmed }]
      })
  } catch {
    return []
  }
}

export default function BrewPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debouncedQuery = useDebounce(query, 350)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Prevent double-firing the pending-commander effect
  const pendingHandled = useRef(false)

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      setShowResults(false)
      return
    }
    setSearching(true)
    searchCards(`is:commander ${debouncedQuery}`)
      .then((cards) => {
        setResults(cards.slice(0, 8))
        setShowResults(cards.length > 0)
      })
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const createDeck = useCallback(
    async (card: ScryfallCard) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        // Save selection so we can resume after login
        sessionStorage.setItem(PENDING_COMMANDER_KEY, JSON.stringify(card))
        router.push("/login")
        return
      }

      setCreating(true)
      setShowResults(false)

      try {
        const { data: deck, error } = await supabase
          .from("decks")
          .insert({
            name: `${card.name} Commander Deck`,
            user_id: user.id,
            format: "edh",
            commander_scryfall_ids: [card.id],
            cover_image_scryfall_id: card.id,
          })
          .select()
          .single()

        if (error) throw error

        // Insert commander as first card
        await supabase.from("deck_cards").insert({
          deck_id: deck.id,
          scryfall_id: card.id,
          name: card.name,
          quantity: 1,
        })

        // Try to populate from EDHREC average deck
        const edhrecCards = await fetchEDHRECCards(card.name)
        if (edhrecCards.length > 0) {
          const nonCommanderCards = edhrecCards.filter(
            (c) => c.name.toLowerCase() !== card.name.toLowerCase()
          )
          if (nonCommanderCards.length > 0) {
            const scryfallCards = await getCardsCollection(
              nonCommanderCards.map((c) => c.name)
            )
            const inserts = nonCommanderCards.flatMap((ec) => {
              const sc = scryfallCards.find(
                (s) => s.name.toLowerCase() === ec.name.toLowerCase()
              )
              if (!sc) return []
              return [
                {
                  deck_id: deck.id,
                  scryfall_id: sc.id,
                  name: sc.name,
                  quantity: ec.quantity,
                },
              ]
            })
            if (inserts.length > 0) {
              await supabase.from("deck_cards").insert(inserts)
              toast.success(
                `Loaded EDHREC average deck (${inserts.length} cards)`
              )
            }
          }
        }

        router.push(`/decks/${deck.id}`)
      } catch (err: any) {
        toast.error(err.message || "Failed to create deck")
        setCreating(false)
      }
    },
    [router]
  )

  // After returning from login, auto-resume a pending commander selection
  useEffect(() => {
    if (pendingHandled.current) return
    pendingHandled.current = true

    const raw = sessionStorage.getItem(PENDING_COMMANDER_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_COMMANDER_KEY)

    try {
      const card = JSON.parse(raw) as ScryfallCard
      setQuery(card.name)
      createDeck(card)
    } catch {
      // malformed storage entry — ignore
    }
  }, [createDeck])

  const handleSelect = useCallback(
    async (card: ScryfallCard) => {
      setQuery(card.name)
      await createDeck(card)
    },
    [createDeck]
  )

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault()
      await handleSelect(results[0])
    } else if (e.key === "Escape") {
      setShowResults(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl space-y-10 text-center"
      >
        <h1 className="font-heading text-5xl font-bold leading-tight text-foreground md:text-6xl">
          Welcome to idlebrew
        </h1>

        <div ref={containerRef} className="relative w-full">
          <div className="relative">
            <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2">
              {searching || creating ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder="what shall we brew?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => results.length > 0 && setShowResults(true)}
              disabled={creating}
              className="h-16 w-full rounded-2xl border-2 border-border bg-card pl-14 pr-6 text-lg text-foreground shadow-lg placeholder:text-muted-foreground transition-colors hover:border-primary/40 focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </div>

          <AnimatePresence>
            {showResults && results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
              >
                {results.map((card, i) => (
                  <div
                    key={card.id}
                    onClick={() => handleSelect(card)}
                    className={`flex cursor-pointer items-center gap-4 p-3 transition-colors hover:bg-muted ${
                      i > 0 ? "border-t border-border/50" : ""
                    }`}
                  >
                    {card.image_uris && (
                      <img
                        src={card.image_uris.small}
                        alt={card.name}
                        className="h-14 w-auto shrink-0 rounded-md shadow-md"
                      />
                    )}
                    <div className="min-w-0 text-left">
                      <p className="truncate font-semibold text-foreground">
                        {card.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.type_line}
                      </p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {creating && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-muted-foreground"
            >
              Building your deck...
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
