"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Loader2, ChevronDown, X } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCardsCollection, getCardByName, ScryfallCard } from "@/lib/scryfall"
import { useDebounce } from "@/hooks/use-debounce"
import {
  buildPartnerScryfallQuery,
  getPartnerKind,
  partnerHelperText,
} from "@/lib/commander-pairing"
import {
  BRACKET_GC_LIMIT,
  BRACKET_LABELS,
  Bracket,
  bracketHelperText,
  isGameChanger,
} from "@/lib/game-changers"
import { toast } from "sonner"

const PENDING_COMMANDER_KEY = "idlebrew:pendingCommander"

type BrewOpts = {
  secondCommander: ScryfallCard | null
  bracket: Bracket
  budgetUsd: number | null
  slots: { lands: number; creatures: number; spells: number }
}

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
    if (data._raw) console.debug("[edhrec] unknown response shape:", data._raw)
    const decklistText: unknown = data.decklist
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

export function BrewSection() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [statusQueue, setStatusQueue] = useState<string[]>(["Setting up your deck…"])
  const displayedStatus = statusQueue[0] ?? "Setting up your deck…"
  const pushStatus = useCallback((msg: string) => {
    setStatusQueue((q) => [...q, msg])
  }, [])
  const [showResults, setShowResults] = useState(false)
  const debouncedQuery = useDebounce(query, 350)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [primaryCommander, setPrimaryCommander] = useState<ScryfallCard | null>(null)
  const [secondCommander, setSecondCommander] = useState<ScryfallCard | null>(null)
  const [secondQuery, setSecondQuery] = useState("")
  const [secondResults, setSecondResults] = useState<ScryfallCard[]>([])
  const [secondShowResults, setSecondShowResults] = useState(false)
  const [secondSearching, setSecondSearching] = useState(false)
  const debouncedSecondQuery = useDebounce(secondQuery, 350)
  const secondContainerRef = useRef<HTMLDivElement>(null)

  const [bracket, setBracket] = useState<Bracket>(3)
  const [budget, setBudget] = useState<string>("")
  const [slots, setSlots] = useState<{ lands: number; creatures: number; spells: number }>({
    lands: 37,
    creatures: 30,
    spells: 32,
  })
  const [slotDrafts, setSlotDrafts] = useState<{ lands: string | null; creatures: string | null; spells: string | null }>({
    lands: null,
    creatures: null,
    spells: null,
  })

  const slotTotal = 99 - (secondCommander ? 1 : 0)
  const partnerKind = primaryCommander ? getPartnerKind(primaryCommander) : null
  const secondCommanderEnabled = !!partnerKind

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
      if (
        secondContainerRef.current &&
        !secondContainerRef.current.contains(e.target as Node)
      ) {
        setSecondShowResults(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (!primaryCommander || !secondCommanderEnabled) {
      setSecondResults([])
      setSecondShowResults(false)
      return
    }
    if (!debouncedSecondQuery.trim()) {
      setSecondResults([])
      setSecondShowResults(false)
      return
    }
    const partnerQuery = buildPartnerScryfallQuery(primaryCommander)
    if (!partnerQuery) return
    setSecondSearching(true)
    searchCards(`${partnerQuery} ${debouncedSecondQuery}`)
      .then((cards) => {
        const filtered = cards.filter((c) => c.id !== primaryCommander.id).slice(0, 8)
        setSecondResults(filtered)
        setSecondShowResults(filtered.length > 0)
      })
      .finally(() => setSecondSearching(false))
  }, [debouncedSecondQuery, primaryCommander, secondCommanderEnabled])

  useEffect(() => {
    if (secondCommander && !secondCommanderEnabled) {
      setSecondCommander(null)
      setSecondQuery("")
    }
  }, [secondCommanderEnabled, secondCommander])

  const adjustSlots = useCallback(
    (key: "lands" | "creatures" | "spells", rawVal: number) => {
      setSlots((prev) => {
        const total = 99 - (secondCommander ? 1 : 0)
        const newVal = Math.max(0, Math.min(total, Math.round(rawVal)))
        const next = { ...prev, [key]: newVal }
        let diff = newVal - prev[key]
        const order = ["lands", "creatures", "spells"] as const
        const idx = order.indexOf(key)
        for (let offset = 1; offset < order.length && diff !== 0; offset++) {
          const target = order[(idx + offset) % order.length]
          if (diff > 0) {
            const taken = Math.min(next[target], diff)
            next[target] -= taken
            diff -= taken
          } else {
            next[target] += -diff
            diff = 0
          }
        }
        return next
      })
    },
    [secondCommander]
  )

  useEffect(() => {
    setSlots((prev) => {
      const target = 99 - (secondCommander ? 1 : 0)
      const sum = prev.lands + prev.creatures + prev.spells
      if (sum === target) return prev
      const diff = target - sum
      return { ...prev, spells: Math.max(0, prev.spells + diff) }
    })
  }, [secondCommander])

  // Drain status queue — display each message for at least 300ms before
  // advancing, so fast back-to-back updates don't flash by unread.
  useEffect(() => {
    if (statusQueue.length <= 1) return
    const t = setTimeout(() => {
      setStatusQueue((q) => (q.length > 1 ? q.slice(1) : q))
    }, 300)
    return () => clearTimeout(t)
  }, [statusQueue])

  const createDeck = useCallback(
    async (card: ScryfallCard, opts: BrewOpts) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        sessionStorage.setItem(
          PENDING_COMMANDER_KEY,
          JSON.stringify({ card, opts })
        )
        window.dispatchEvent(new CustomEvent("open-login-dialog"))
        return
      }

      setCreating(true)
      setStatusQueue(["Setting up your deck…"])
      setShowResults(false)

      try {
        const commanderIds = [card.id]
        if (opts.secondCommander) commanderIds.push(opts.secondCommander.id)

        const deckName = opts.secondCommander
          ? `${card.name} & ${opts.secondCommander.name} Commander Deck`
          : `${card.name} Commander Deck`

        const { data: deck, error } = await supabase
          .from("decks")
          .insert({
            name: deckName,
            user_id: user.id,
            format: "edh",
            commander_scryfall_ids: commanderIds,
            cover_image_scryfall_id: card.id,
          })
          .select()
          .single()

        if (error) throw error

        const gcLimit = BRACKET_GC_LIMIT[opts.bracket]
        let gcCount = 0
        let totalCost = 0
        const priceOf = (c: ScryfallCard | null | undefined): number => {
          const usd = c?.prices?.usd
          return usd ? parseFloat(usd) : 0
        }
        const wouldExceedBudget = (cost: number): boolean =>
          opts.budgetUsd !== null && totalCost + cost > opts.budgetUsd

        pushStatus(
          opts.secondCommander
            ? "Seating your commanders…"
            : "Seating your commander…"
        )
        await supabase.from("deck_cards").insert({
          deck_id: deck.id,
          scryfall_id: card.id,
          name: card.name,
          quantity: 1,
        })
        if (isGameChanger(card.name)) gcCount += 1
        totalCost += priceOf(card)

        if (opts.secondCommander) {
          await supabase.from("deck_cards").insert({
            deck_id: deck.id,
            scryfall_id: opts.secondCommander.id,
            name: opts.secondCommander.name,
            quantity: 1,
          })
          if (isGameChanger(opts.secondCommander.name)) gcCount += 1
          totalCost += priceOf(opts.secondCommander)
        }

        pushStatus("Tossing in a Sol Ring…")
        let solRingInserted = false
        const solRing = await getCardByName("Sol Ring")
        if (solRing && !wouldExceedBudget(priceOf(solRing))) {
          await supabase.from("deck_cards").insert({
            deck_id: deck.id,
            scryfall_id: solRing.id,
            name: solRing.name,
            quantity: 1,
          })
          totalCost += priceOf(solRing)
          solRingInserted = true
        }

        const COLOR_TO_LAND: Record<string, string> = {
          W: "Plains",
          U: "Island",
          B: "Swamp",
          R: "Mountain",
          G: "Forest",
        }
        const LAND_COUNT = opts.slots.lands
        const combinedColors = [
          ...(card.color_identity ?? []),
          ...(opts.secondCommander?.color_identity ?? []),
        ]
        const basicLandNames =
          combinedColors.length > 0
            ? [
                ...new Set(
                  combinedColors
                    .filter((c) => COLOR_TO_LAND[c])
                    .map((c) => COLOR_TO_LAND[c])
                ),
              ]
            : ["Wastes"]

        pushStatus("Consulting EDHREC…")
        const edhrecRaw = await fetchEDHRECCards(card.name)
        const skipNames = new Set([
          card.name.toLowerCase(),
          "sol ring",
          ...(opts.secondCommander ? [opts.secondCommander.name.toLowerCase()] : []),
        ])
        const edhrecFiltered = edhrecRaw.filter((c) => !skipNames.has(c.name.toLowerCase()))

        type DeckRow = {
          deck_id: string
          scryfall_id: string
          name: string
          quantity: number
          _card: ScryfallCard
        }
        const edhrecLands: DeckRow[] = []
        const edhrecCreatures: DeckRow[] = []
        const edhrecSpells: DeckRow[] = []
        if (edhrecFiltered.length > 0) {
          pushStatus("Looking up cards on Scryfall…")
          const scryfallCards = await getCardsCollection(
            edhrecFiltered.map((c) => c.name)
          )
          pushStatus("Sorting cards into roles…")
          for (const ec of edhrecFiltered) {
            const sc = scryfallCards.find(
              (s) => s.name.toLowerCase() === ec.name.toLowerCase()
            )
            if (!sc) continue
            const row: DeckRow = {
              deck_id: deck.id,
              scryfall_id: sc.id,
              name: sc.name,
              quantity: ec.quantity,
              _card: sc,
            }
            const tl = sc.type_line?.toLowerCase() ?? ""
            if (tl.includes("land")) edhrecLands.push(row)
            else if (tl.includes("creature")) edhrecCreatures.push(row)
            else edhrecSpells.push(row)
          }
        }

        const takeForRole = (rows: DeckRow[], slotCap: number): DeckRow[] => {
          const taken: DeckRow[] = []
          let used = 0
          for (const row of rows) {
            if (used >= slotCap) break
            const cardCost = priceOf(row._card) * row.quantity
            if (wouldExceedBudget(cardCost)) continue
            const isGc = isGameChanger(row.name)
            if (isGc && gcCount >= gcLimit) continue
            const remaining = slotCap - used
            const qty = Math.min(row.quantity, remaining)
            taken.push({ ...row, quantity: qty })
            used += qty
            totalCost += priceOf(row._card) * qty
            if (isGc) gcCount += 1
          }
          return taken
        }

        pushStatus("Building your mana base…")
        const minBasicEach = Math.min(4, Math.floor(LAND_COUNT / Math.max(1, basicLandNames.length)))
        const minBasicsTotal = basicLandNames.length * minBasicEach
        const edhrecLandSlots = Math.max(0, LAND_COUNT - minBasicsTotal)
        const edhrecLandInserts = takeForRole(edhrecLands, edhrecLandSlots)
        const edhrecLandsTaken = edhrecLandInserts.reduce((s, r) => s + r.quantity, 0)
        const unfilledSlots = edhrecLandSlots - edhrecLandsTaken

        const basicCounts: Record<string, number> = Object.fromEntries(
          basicLandNames.map((name) => [name, minBasicEach])
        )
        const extraPerBasic = Math.floor(unfilledSlots / Math.max(1, basicLandNames.length))
        const extraRemainder = unfilledSlots % Math.max(1, basicLandNames.length)
        basicLandNames.forEach((name, i) => {
          basicCounts[name] += extraPerBasic + (i < extraRemainder ? 1 : 0)
        })

        const basicScryfallCards = await getCardsCollection(basicLandNames)
        const basicLandInserts = basicLandNames.flatMap((name) => {
          const sc = basicScryfallCards.find(
            (c) => c.name.toLowerCase() === name.toLowerCase()
          )
          if (!sc || basicCounts[name] <= 0) return []
          return [
            {
              deck_id: deck.id,
              scryfall_id: sc.id,
              name: sc.name,
              quantity: basicCounts[name],
            },
          ]
        })

        const stripCard = ({ _card: _, ...row }: DeckRow) => row
        const allLandInserts = [...basicLandInserts, ...edhrecLandInserts.map(stripCard)]
        if (allLandInserts.length > 0) {
          await supabase.from("deck_cards").insert(allLandInserts)
        }

        pushStatus("Filling out creatures and spells…")
        const creatureInserts = takeForRole(edhrecCreatures, opts.slots.creatures)
        const spellSlotsRemaining = Math.max(0, opts.slots.spells - (solRingInserted ? 1 : 0))
        const spellInserts = takeForRole(edhrecSpells, spellSlotsRemaining)

        const nonLandInserts = [...creatureInserts, ...spellInserts].map(stripCard)
        const totalNonLandTaken = creatureInserts.reduce((s, r) => s + r.quantity, 0) + spellInserts.reduce((s, r) => s + r.quantity, 0)
        if (nonLandInserts.length > 0) {
          await supabase.from("deck_cards").insert(nonLandInserts)
          toast.success(
            `Loaded ${edhrecLandsTaken + totalNonLandTaken} cards from EDHREC`
          )
        } else if (edhrecLandsTaken === 0) {
          toast.info(
            "Deck created — EDHREC data unavailable, add cards manually"
          )
        } else {
          toast.success(`Loaded ${edhrecLandsTaken} cards from EDHREC`)
        }

        pushStatus("Shuffling up…")
        router.push(`/decks/${deck.id}`)
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to create deck"
        toast.error(message)
        setCreating(false)
      }
    },
    [router]
  )

  // After sign-in, auto-resume a pending commander selection
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event !== "SIGNED_IN" && event !== "INITIAL_SESSION") || !session?.user) return
      const raw = sessionStorage.getItem(PENDING_COMMANDER_KEY)
      if (!raw) return
      sessionStorage.removeItem(PENDING_COMMANDER_KEY)
      try {
        const parsed = JSON.parse(raw) as
          | { card: ScryfallCard; opts: BrewOpts }
          | ScryfallCard
        const card = "card" in parsed ? parsed.card : parsed
        const opts: BrewOpts =
          "opts" in parsed
            ? parsed.opts
            : {
                secondCommander: null,
                bracket: 3,
                budgetUsd: null,
                slots: { lands: 37, creatures: 30, spells: 32 },
              }
        setQuery(card.name)
        setPrimaryCommander(card)
        if (opts.secondCommander) {
          setSecondCommander(opts.secondCommander)
          setSecondQuery(opts.secondCommander.name)
        }
        setBracket(opts.bracket)
        setBudget(opts.budgetUsd === null ? "" : String(opts.budgetUsd))
        setSlots(opts.slots)
        if (
          opts.secondCommander ||
          opts.bracket !== 3 ||
          opts.budgetUsd !== null
        ) {
          setAdvancedOpen(true)
        }
        createDeck(card, opts)
      } catch {
        // malformed storage entry — ignore
      }
    })
    return () => subscription.unsubscribe()
  }, [createDeck])

  const buildOpts = useCallback(() => {
    const parsedBudget = budget.trim() === "" ? null : Math.max(0, parseFloat(budget))
    return {
      secondCommander,
      bracket,
      budgetUsd: parsedBudget !== null && !isNaN(parsedBudget) ? parsedBudget : null,
      slots,
    }
  }, [secondCommander, bracket, budget, slots])

  const handleSelect = useCallback(
    async (card: ScryfallCard) => {
      setQuery(card.name)
      setPrimaryCommander(card)
      setShowResults(false)
      if (advancedOpen) return
      await createDeck(card, buildOpts())
    },
    [createDeck, advancedOpen, buildOpts]
  )

  const handleSelectSecond = useCallback((card: ScryfallCard) => {
    setSecondCommander(card)
    setSecondQuery(card.name)
    setSecondShowResults(false)
  }, [])

  const handleBuild = useCallback(async () => {
    if (!primaryCommander) {
      toast.error("Pick a commander first")
      return
    }
    await createDeck(primaryCommander, buildOpts())
  }, [primaryCommander, createDeck, buildOpts])

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
              placeholder="what commander shall we brew?"
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

        <div className="w-full">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mx-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Advanced
            <ChevronDown
              className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {advancedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-5 rounded-2xl border border-border bg-card p-5 text-left shadow-md">
                  {/* Second commander */}
                  <div ref={secondContainerRef} className="relative space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Second commander
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                        {secondSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Search className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder={
                          secondCommanderEnabled
                            ? "Search for a partner…"
                            : "Pick a commander with Partner / Background / etc."
                        }
                        value={secondQuery}
                        onChange={(e) => {
                          setSecondQuery(e.target.value)
                          if (secondCommander) setSecondCommander(null)
                        }}
                        onFocus={() =>
                          secondResults.length > 0 && setSecondShowResults(true)
                        }
                        disabled={!secondCommanderEnabled || creating}
                        className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-primary/40 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {secondCommander && (
                        <button
                          type="button"
                          onClick={() => {
                            setSecondCommander(null)
                            setSecondQuery("")
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Clear second commander"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {partnerHelperText(primaryCommander)}
                    </p>
                    <AnimatePresence>
                      {secondShowResults && secondResults.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                        >
                          {secondResults.map((card, i) => (
                            <div
                              key={card.id}
                              onClick={() => handleSelectSecond(card)}
                              className={`flex cursor-pointer items-center gap-3 p-2 transition-colors hover:bg-muted ${
                                i > 0 ? "border-t border-border/50" : ""
                              }`}
                            >
                              {card.image_uris && (
                                <img
                                  src={card.image_uris.small}
                                  alt={card.name}
                                  className="h-12 w-auto shrink-0 rounded-md shadow"
                                />
                              )}
                              <div className="min-w-0 text-left">
                                <p className="truncate text-sm font-semibold text-foreground">
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

                  {/* Budget */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Total budget (USD)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        placeholder="No limit"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        disabled={creating}
                        className="h-10 w-40 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <label className="block text-sm font-medium text-foreground">
                        Card mix
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {slots.lands + slots.creatures + slots.spells} / {slotTotal}
                      </span>
                    </div>
                    {(["lands", "creatures", "spells"] as const).map((key) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-sm capitalize text-muted-foreground">
                          {key}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={slotTotal}
                          value={slots[key]}
                          onChange={(e) => adjustSlots(key, parseInt(e.target.value))}
                          disabled={creating}
                          className="flex-1 accent-primary"
                        />
                        <input
                          type="number"
                          min={0}
                          max={slotTotal}
                          value={slotDrafts[key] ?? String(slots[key])}
                          onChange={(e) => {
                            const v = e.target.value
                            setSlotDrafts((d) => ({ ...d, [key]: v }))
                            if (v === "" || v === "-") return
                            const n = parseInt(v)
                            if (!isNaN(n)) adjustSlots(key, n)
                          }}
                          onBlur={() =>
                            setSlotDrafts((d) => ({ ...d, [key]: null }))
                          }
                          disabled={creating}
                          className="h-9 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Bracket */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Bracket
                    </label>
                    <div className="flex gap-2">
                      {([1, 2, 3, 4, 5] as const).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBracket(b)}
                          disabled={creating}
                          className={`flex-1 rounded-md border px-2 py-2 text-xs transition-colors disabled:opacity-50 ${
                            bracket === b
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="font-semibold">{b}</div>
                          <div className="text-[10px] opacity-70">{BRACKET_LABELS[b]}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {bracketHelperText(bracket)}
                    </p>
                  </div>

                  {/* Build button */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleBuild}
                      disabled={!primaryCommander || creating}
                      className="w-full rounded-xl border-2 border-primary bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creating
                        ? "Building…"
                        : primaryCommander
                          ? `Build ${primaryCommander.name}${secondCommander ? ` & ${secondCommander.name}` : ""}`
                          : "Pick a commander first"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {creating && (
            <motion.p
              key={displayedStatus}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="text-muted-foreground"
            >
              {displayedStatus}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
