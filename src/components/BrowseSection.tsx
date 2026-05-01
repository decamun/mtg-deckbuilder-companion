"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Filter, Loader2, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebounce } from "@/hooks/use-debounce"
import { BRACKET_LABELS } from "@/lib/game-changers"
import { formatPrice } from "@/lib/format"
import { autocompleteCardNames, getCardsByIds } from "@/lib/scryfall"
import { supabase } from "@/lib/supabase/client"

type BrowseDeck = {
  id: string
  name: string
  description: string | null
  format: string | null
  cover_image_scryfall_id: string | null
  commander_scryfall_ids: string[]
  commander_names: string[]
  budget_usd: number | string | null
  bracket: number | null
  created_at: string
  rank: number
  cover_url?: string
}

type LegacyDeckRow = Omit<BrowseDeck, "commander_names" | "budget_usd" | "bracket" | "rank">

const FORMAT_OPTIONS = [
  { value: "all", label: "Any format" },
  { value: "edh", label: "EDH / Commander" },
  { value: "standard", label: "Standard" },
  { value: "modern", label: "Modern" },
  { value: "pioneer", label: "Pioneer" },
  { value: "legacy", label: "Legacy" },
  { value: "vintage", label: "Vintage" },
  { value: "pauper", label: "Pauper" },
  { value: "other", label: "Other" },
]

function parseMoney(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeDeck(row: BrowseDeck): BrowseDeck {
  return {
    ...row,
    commander_scryfall_ids: row.commander_scryfall_ids ?? [],
    commander_names: row.commander_names ?? [],
    budget_usd: row.budget_usd == null ? null : Number(row.budget_usd),
  }
}

function isMissingBrowseRpc(error: { message?: string; code?: string }) {
  return (
    error.code === "PGRST202" ||
    (error.message ?? "").toLowerCase().includes("browse_decks")
  )
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function fuzzyMatch(needle: string, haystack: string) {
  const query = normalizeText(needle)
  const text = normalizeText(haystack)
  if (!query) return true
  if (text.includes(query)) return true

  let index = 0
  for (const char of query) {
    index = text.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}

async function browseDecksFallback(params: {
  search: string
  commander: string
  format: string
  usesUnavailableFilters: boolean
}): Promise<BrowseDeck[]> {
  if (params.usesUnavailableFilters) {
    throw new Error("Budget and bracket filters will be available once the browse search migration is applied.")
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, name, description, format, cover_image_scryfall_id, commander_scryfall_ids, created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as LegacyDeckRow[]).map((deck) => ({
    ...deck,
    commander_scryfall_ids: deck.commander_scryfall_ids ?? [],
  }))
  const commanderIds = Array.from(
    new Set(rows.flatMap((deck) => deck.commander_scryfall_ids))
  )
  const commanderNameMap = new Map<string, string[]>()

  if (rows.length > 0 && commanderIds.length > 0) {
    const { data: commanderRows } = await supabase
      .from("deck_cards")
      .select("deck_id, scryfall_id, name")
      .in("deck_id", rows.map((deck) => deck.id))
      .in("scryfall_id", commanderIds)

    for (const card of commanderRows ?? []) {
      const current = commanderNameMap.get(card.deck_id) ?? []
      if (!current.includes(card.name)) current.push(card.name)
      commanderNameMap.set(card.deck_id, current)
    }
  }

  return rows
    .map((deck) => ({
      ...deck,
      commander_names: commanderNameMap.get(deck.id) ?? [],
      budget_usd: null,
      bracket: null,
      rank: 0,
    }))
    .filter((deck) => {
      const commanderNames = deck.commander_names.join(" ")
      const searchText = `${deck.name} ${deck.description ?? ""} ${commanderNames}`
      return (
        fuzzyMatch(params.search, searchText) &&
        fuzzyMatch(params.commander, commanderNames) &&
        (params.format === "all" || deck.format === params.format)
      )
    })
    .slice(0, 24)
}

export function BrowseSection() {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [commander, setCommander] = useState("")
  const [minBudget, setMinBudget] = useState("")
  const [maxBudget, setMaxBudget] = useState("")
  const [bracket, setBracket] = useState("all")
  const [format, setFormat] = useState("all")
  const [decks, setDecks] = useState<BrowseDeck[]>([])
  const [loading, setLoading] = useState(false)
  const [hasActiveSearch, setHasActiveSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 220)
  const debouncedCommander = useDebounce(commander, 220)
  const debouncedMinBudget = useDebounce(minBudget, 220)
  const debouncedMaxBudget = useDebounce(maxBudget, 220)
  const visibleSuggestions = debouncedQuery.trim().length >= 2 ? suggestions : []

  const activeFilterCount = useMemo(
    () =>
      [commander.trim(), minBudget.trim(), maxBudget.trim()].filter(Boolean).length +
      (bracket !== "all" ? 1 : 0) +
      (format !== "all" ? 1 : 0),
    [commander, minBudget, maxBudget, bracket, format]
  )

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (debouncedQuery.trim().length < 2) {
      return
    }
    autocompleteCardNames(debouncedQuery).then((names) => {
      if (!cancelled) setSuggestions(names)
    })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      const searchTerm = debouncedQuery.trim()
      const commanderTerm = debouncedCommander.trim()
      const hasSearchInput =
        searchTerm.length > 0 ||
        commanderTerm.length > 0 ||
        debouncedMinBudget.trim().length > 0 ||
        debouncedMaxBudget.trim().length > 0 ||
        bracket !== "all" ||
        format !== "all"

      setLoading(true)
      setError(null)
      setHasActiveSearch(hasSearchInput)
      const { data, error: searchError } = await supabase.rpc("browse_decks", {
        p_search: searchTerm,
        p_commander: commanderTerm,
        p_min_budget: parseMoney(debouncedMinBudget),
        p_max_budget: parseMoney(debouncedMaxBudget),
        p_bracket: bracket === "all" ? null : Number(bracket),
        p_format: format === "all" ? "" : format,
        p_limit: 24,
      })

      if (cancelled) return
      if (searchError) {
        if (!isMissingBrowseRpc(searchError)) {
          setError(searchError.message)
          setDecks([])
          setLoading(false)
          return
        }

        try {
          const fallbackRows = await browseDecksFallback({
            search: searchTerm,
            commander: commanderTerm,
            format,
            usesUnavailableFilters:
              debouncedMinBudget.trim().length > 0 ||
              debouncedMaxBudget.trim().length > 0 ||
              bracket !== "all",
          })
          if (cancelled) return
          await populateDeckCovers(fallbackRows)
        } catch (fallbackError) {
          if (cancelled) return
          setError(fallbackError instanceof Error ? fallbackError.message : searchError.message)
          setDecks([])
          setLoading(false)
        }
        return
      }

      const rows = ((data ?? []) as BrowseDeck[]).map(normalizeDeck)
      await populateDeckCovers(rows)
    }

    async function populateDeckCovers(rows: BrowseDeck[]) {
      const coverIds = rows
        .map((deck) => deck.cover_image_scryfall_id)
        .filter((id): id is string => Boolean(id))
      const coverCards = await getCardsByIds(coverIds)
      if (cancelled) return
      const coverMap = new Map(coverCards.map((card) => [card.id, card]))
      setDecks(
        rows.map((deck) => ({
          ...deck,
          cover_url: coverMap.get(deck.cover_image_scryfall_id ?? "")?.image_uris
            ?.normal,
        }))
      )
      setLoading(false)
    }

    void runSearch()
    return () => {
      cancelled = true
    }
  }, [
    debouncedQuery,
    debouncedCommander,
    debouncedMinBudget,
    debouncedMaxBudget,
    bracket,
    format,
  ])

  const clearFilters = () => {
    setCommander("")
    setMinBudget("")
    setMaxBudget("")
    setBracket("all")
    setFormat("all")
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-12">
      <div className="mb-8 max-w-3xl">
        <h2 className="font-heading text-4xl font-bold text-foreground mb-2">
          Browse Decks
        </h2>
        <p className="text-muted-foreground">
          Search public brews by deck name, description, and commander.
        </p>
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div ref={searchRef} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => visibleSuggestions.length > 0 && setShowSuggestions(true)}
              className="h-11 rounded-xl bg-background pl-9 pr-9"
              placeholder="Search decks, descriptions, or commanders..."
              aria-label="Search public decks"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setSuggestions([])
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <AnimatePresence>
              {showSuggestions && visibleSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                >
                  {visibleSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setQuery(name)
                        setShowSuggestions(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="h-11 justify-center"
          >
            <Filter className="h-4 w-4" />
            Advanced
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  value={commander}
                  onChange={(event) => setCommander(event.target.value)}
                  className="h-10 bg-background"
                  placeholder="Commander"
                  aria-label="Filter by commander"
                />
                <Input
                  value={minBudget}
                  onChange={(event) => setMinBudget(event.target.value)}
                  className="h-10 bg-background"
                  inputMode="decimal"
                  placeholder="Min budget"
                  aria-label="Minimum budget"
                />
                <Input
                  value={maxBudget}
                  onChange={(event) => setMaxBudget(event.target.value)}
                  className="h-10 bg-background"
                  inputMode="decimal"
                  placeholder="Max budget"
                  aria-label="Maximum budget"
                />
                <Select value={bracket} onValueChange={(value) => value && setBracket(value)}>
                  <SelectTrigger className="h-10 w-full bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="all">Any bracket</SelectItem>
                    {([1, 2, 3, 4, 5] as const).map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} - {BRACKET_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={format} onValueChange={(value) => value && setFormat(value)}>
                  <SelectTrigger className="h-10 w-full bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-3"
                >
                  Clear filters
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((key) => (
            <div
              key={key}
              className="h-72 animate-pulse rounded-2xl border border-border/60 bg-card/50"
            />
          ))}
        </div>
      ) : decks.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {decks.map((deck) => (
            <Link key={deck.id} href={`/decks/${deck.id}`} className="group">
              <article className="relative h-72 overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50">
                <div className="absolute inset-0">
                  {deck.cover_url ? (
                    <>
                      <img
                        src={deck.cover_url}
                        alt=""
                        className="h-full w-full object-cover opacity-35 transition-opacity group-hover:opacity-50"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/20" />
                    </>
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-muted to-card" />
                  )}
                </div>
                <div className="relative z-10 flex h-full flex-col justify-end p-5">
                  <div className="mb-auto flex flex-wrap gap-2">
                    {deck.format && <Badge variant="outline">{deck.format}</Badge>}
                    {deck.bracket && (
                      <Badge variant="secondary">Bracket {deck.bracket}</Badge>
                    )}
                    {deck.budget_usd != null && (
                      <Badge variant="outline">{formatPrice(deck.budget_usd)}</Badge>
                    )}
                  </div>
                  <h3 className="mb-2 font-heading text-2xl font-bold text-foreground transition-colors group-hover:text-primary">
                    {deck.name}
                  </h3>
                  {deck.commander_names.length > 0 && (
                    <p className="mb-2 text-sm font-medium text-foreground/80">
                      {deck.commander_names.join(" + ")}
                    </p>
                  )}
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {deck.description || "No description yet."}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Open deck <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      ) : hasActiveSearch ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-20 text-center">
          <p className="mb-2 font-medium text-foreground">No decks found</p>
          <p className="text-sm text-muted-foreground">
            Try a broader search or clear advanced filters.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/30 py-20 text-center">
          <p className="mb-2 font-medium text-foreground">No public decks yet</p>
          <p className="text-sm text-muted-foreground">
            Public decks will appear here as brewers publish them.
          </p>
        </div>
      )}

      {loading && (
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching public decks...
        </div>
      )}
    </div>
  )
}
