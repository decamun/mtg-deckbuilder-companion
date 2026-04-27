"use client"

import { useState, useEffect, use, useRef, useMemo } from "react"
import { motion } from "framer-motion"
import { Search, LayoutGrid, List, Layers as StackIcon, Crown, Image as ImageIcon, MoreVertical, Settings, Edit as EditIcon, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCardsByIds, getOldestPrintingsByOracleIds, getCard, getPrintingsByOracleId, type ScryfallCard, type ScryfallPrinting } from "@/lib/scryfall"
import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { DeckAnalytics } from "@/components/deck-analytics"
import { DeckSettingsDialog } from "@/components/deck/DeckSettingsDialog"
import { DeckTabs, type DeckTab } from "@/components/deck/DeckTabs"
import { PrimerView } from "@/components/primer/PrimerView"
import { PrimerEditor } from "@/components/primer/PrimerEditor"
import { VersionsTab } from "@/components/versions/VersionsTab"
import { ViewingVersionBanner } from "@/components/versions/ViewingVersionBanner"
import { recordVersion, getVersion, revertToVersion, flushPendingVersion, type DeckVersionRow } from "@/lib/versions"
import { formatPrice, pickPrice } from "@/lib/format"

type ViewingSnapshotState = {
  versionId: string
  label: string
  cards: DeckCard[]
  deckMeta: { name: string; description: string | null; format: string | null; commanders: string[]; cover_image_scryfall_id: string | null; is_public: boolean }
  primerMarkdown: string
  coverImageUrl: string | null
}

// Stack card width is w-44 (176px); height ≈ 176 * 1.4 = 246px
const STACK_PEEK = 32
const STACK_EXTRA_PEEK = 14
const STACK_CARD_HEIGHT = 246
const STACK_HOVER_SHIFT = 44

const DEFAULT_TAGS = ['card advantage', 'interaction', 'wincon', 'combo piece']

const defaultPrimerSeed = (deckName: string) =>
`# ${deckName}

Welcome to the primer for **${deckName}**.

## Game Plan
- _Describe the high-level strategy here._

## Key Cards
- _List your engine pieces and why they matter._

## Mulligans
- _What does an ideal opening hand look like?_
`

export default function DeckWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [deck, setDeck] = useState<Deck | null>(null)
  const [cards, setCards] = useState<DeckCard[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedResultIdx, setSelectedResultIdx] = useState(0)

  const [viewMode, setViewMode] = useState<ViewMode>('visual')
  const [grouping, setGrouping] = useState<GroupingMode>('type')
  const [sorting, setSorting] = useState<SortingMode>('name')
  const debouncedQuery = useDebounce(query, 300)

  const [commanderIds, setCommanderIds] = useState<string[]>([])
  const [coverImageId, setCoverImageId] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)

  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState("")
  const [activeCardIdForTag, setActiveCardIdForTag] = useState<string | null>(null)

  const [hoveredStack, setHoveredStack] = useState<{ groupName: string; colIdx: number; itemIdx: number } | null>(null)

  // New: ownership, tabs, settings, primer, version-viewing
  const [isOwner, setIsOwner] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const tabParam = (searchParams?.get("tab") ?? null) as DeckTab | null
  const [tab, setTabState] = useState<DeckTab>(tabParam ?? "decklist")
  const setTab = (t: DeckTab) => {
    setTabState(t)
    const url = new URL(window.location.href)
    if (t === "decklist") url.searchParams.delete("tab")
    else url.searchParams.set("tab", t)
    router.replace(`${url.pathname}${url.search}`)
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [primerEditing, setPrimerEditing] = useState(false)
  const [primerMarkdown, setPrimerMarkdown] = useState("")
  const [cardsLoading, setCardsLoading] = useState(true)
  const [printingsByCard, setPrintingsByCard] = useState<Record<string, ScryfallPrinting[]>>({})
  const [viewing, setViewing] = useState<ViewingSnapshotState | null>(null)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Drag coordination. HTML5 drag is hostile to DOM mutations mid-drag —
  // even an in-place re-render of the dragged element (e.g. swapping an img
  // src) causes Chrome/Firefox to lose the drag source, leaving dragend
  // unfired and isDragging stuck true forever. We defer ALL React state
  // updates that originate inside fetchDeck until dragend fires:
  //   - pendingFetch: a new fetchDeck() was requested while dragging
  //   - pendingSetCards: fetchDeck completed but setCards was suppressed
  const isDragging = useRef(false)
  const pendingDrop = useRef<{ cardId: string; tag: string } | null>(null)
  const pendingFetch = useRef(false)
  const pendingSetCards = useRef<DeckCard[] | null>(null)
  const dragCallbacksRef = useRef<{
    addTag: (cardId: string, tag: string) => Promise<void>
    fetchDeck: () => Promise<void>
  }>(null!)

  useEffect(() => {
    fetchDeck()
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deck_cards', filter: `deck_id=eq.${deckId}` }, () => {
        if (isDragging.current) {
          pendingFetch.current = true
        } else {
          fetchDeck()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [deckId])

  useEffect(() => {
    if (tab === 'versions') void flushPendingVersion(deckId)
  }, [tab, deckId])

  useEffect(() => {
    return () => { void flushPendingVersion(deckId) }
  }, [deckId])

  useEffect(() => {
    const onDragEnd = () => {
      isDragging.current = false

      // Flush any cards state that was suppressed while dragging.
      // Apply before addTag/fetchDeck so the UI isn't blank.
      const pendingCards = pendingSetCards.current
      pendingSetCards.current = null
      if (pendingCards) setCards(pendingCards)

      const { addTag, fetchDeck } = dragCallbacksRef.current
      const drop = pendingDrop.current
      pendingDrop.current = null
      if (drop) addTag(drop.cardId, drop.tag)
      if (pendingFetch.current) {
        pendingFetch.current = false
        fetchDeck()
      }
    }
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  useEffect(() => {
    if (debouncedQuery.length > 1) {
      searchCards(debouncedQuery).then(setResults)
    } else {
      setResults([])
    }
  }, [debouncedQuery])

  useEffect(() => {
    setSelectedResultIdx(0)
  }, [results])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchDeck = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const viewerId = session?.user.id ?? null

    const { data: deckData, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .maybeSingle()

    if (deckError || !deckData) {
      // RLS hides private decks from non-owners — render the access-denied page.
      setAccessDenied(true)
      return
    }
    setAccessDenied(false)

    const owner = !!viewerId && deckData.user_id === viewerId
    setIsOwner(owner)
    setDeck(deckData)
    setCommanderIds(deckData.commander_scryfall_ids || [])
    setCoverImageId(deckData.cover_image_scryfall_id || null)
    setPrimerMarkdown(deckData.primer_markdown || '')

    const { data: cardsData, error: cardsError } = await supabase
      .from('deck_cards')
      .select('*')
      .eq('deck_id', deckData.id)

    if (cardsError) {
      toast.error('Failed to load cards')
      return
    }

    if (cardsData) {
      const idsToFetch = new Set<string>()
      for (const c of cardsData) idsToFetch.add(c.printing_scryfall_id || c.scryfall_id)
      if (deckData.cover_image_scryfall_id) idsToFetch.add(deckData.cover_image_scryfall_id)

      const sfCards = await getCardsByIds(Array.from(idsToFetch))
      const sfMap = new Map(sfCards.map(c => [c.id, c]))

      // Build the hydrated DeckCard array for a given oracle-resolution map.
      // Called twice: phase 1 with an empty map (fast, shows stored art
      // immediately), phase 2 with the full oracle map (updates to oldest print).
      const buildHydrated = (defaultByOracle: Map<string, ScryfallCard>): DeckCard[] =>
        cardsData.map(c => {
          const baseSf = sfMap.get(c.scryfall_id)
          const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
          let effectiveId = c.printing_scryfall_id || c.scryfall_id
          if (!c.printing_scryfall_id && oracleId && defaultByOracle.has(oracleId)) {
            effectiveId = defaultByOracle.get(oracleId)!.id
          }
          const effSf = sfMap.get(effectiveId) ?? baseSf
          const finish = (c.finish ?? 'nonfoil') as 'nonfoil' | 'foil' | 'etched'
          return {
            ...c,
            oracle_id: oracleId,
            finish,
            printing_scryfall_id: c.printing_scryfall_id ?? null,
            image_url: effSf?.image_uris?.normal,
            type_line: effSf?.type_line || '',
            mana_cost: effSf?.mana_cost || '',
            cmc: effSf?.cmc ?? (effSf ? calculateCmc(effSf.mana_cost) : 0),
            colors: effSf?.colors ?? [],
            set_code: effSf?.set,
            collector_number: effSf?.collector_number,
            available_finishes: effSf?.finishes,
            price_usd: pickPrice(effSf?.prices, finish),
            effective_printing_id: effectiveId,
          }
        })

      // Safely apply a hydrated cards array. If a drag is active we park the
      // update in pendingSetCards — onDragEnd flushes it once the drag ends so
      // React never mutates the dragged element's DOM mid-drag (which would
      // cause the browser to lose the drag source and freeze dragend forever).
      const applyHydrated = (hydrated: DeckCard[]) => {
        if (isDragging.current) {
          // Always keep the latest result; earlier phases become irrelevant.
          pendingSetCards.current = hydrated
          return
        }
        pendingSetCards.current = null
        setCards(prev => {
          const prevById = new Map(prev.map(c => [c.id, c]))
          return hydrated.map(h => {
            if (h.image_url) return h
            const p = prevById.get(h.id)
            if (!p || p.effective_printing_id !== h.effective_printing_id || p.finish !== h.finish) return h
            return {
              ...h,
              image_url: p.image_url,
              type_line: h.type_line || p.type_line || '',
              mana_cost: h.mana_cost || p.mana_cost || '',
              cmc: h.cmc || p.cmc || 0,
              colors: h.colors?.length ? h.colors : p.colors,
              set_code: h.set_code ?? p.set_code,
              collector_number: h.collector_number ?? p.collector_number,
              available_finishes: h.available_finishes ?? p.available_finishes,
              price_usd: h.price_usd ?? p.price_usd ?? null,
            }
          })
        })
      }

      // Phase 1: show cards immediately with whatever printing we already have.
      applyHydrated(buildHydrated(new Map()))
      setCardsLoading(false)

      // Phase 2: resolve the oldest printing for unassigned cards, then update.
      const oracleIdsToResolve = new Set<string>()
      for (const c of cardsData) {
        if (!c.printing_scryfall_id) {
          const sf = sfMap.get(c.scryfall_id)
          const oid = c.oracle_id ?? sf?.oracle_id
          if (oid) oracleIdsToResolve.add(oid)
        }
      }
      const defaultByOracle = await getOldestPrintingsByOracleIds(Array.from(oracleIdsToResolve))
      for (const sf of defaultByOracle.values()) sfMap.set(sf.id, sf)
      applyHydrated(buildHydrated(defaultByOracle))

      // Cover image URL
      const coverId = deckData.cover_image_scryfall_id || null
      if (coverId) {
        const inDeck = sfMap.get(coverId)
        if (inDeck?.image_uris?.normal) setCoverImageUrl(inDeck.image_uris.normal)
        else {
          const fetched = await getCard(coverId)
          setCoverImageUrl(fetched?.image_uris?.normal ?? null)
        }
      } else {
        setCoverImageUrl(null)
      }
    }
  }

  const calculateCmc = (mana: string) => {
    let cmc = 0
    const matches = mana.match(/\{[^}]+\}/g)
    if (!matches) return 0
    for (const m of matches) {
      const v = parseInt(m.replace(/[{}]/g, ''))
      cmc += isNaN(v) ? 1 : v
    }
    return cmc
  }

  const addToDeck = async (card: ScryfallCard) => {
    const existing = cards.find(c => c.scryfall_id === card.id)
    if (existing) {
      await supabase.from('deck_cards').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
      recordVersion(deckId, `Increased ${existing.name} to ${existing.quantity + 1}`)
    } else {
      await supabase.from('deck_cards').insert({
        deck_id: deckId,
        scryfall_id: card.id,
        oracle_id: card.oracle_id ?? null,
        printing_scryfall_id: null,
        finish: 'nonfoil',
        name: card.name,
        quantity: 1,
      })
      recordVersion(deckId, `Added ${card.name}`)
    }
  }

  const handleAddCard = (card: ScryfallCard) => {
    addToDeck(card)
    setQuery('')
    setResults([])
    setSearchFocused(false)
    setSelectedResultIdx(0)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchFocused || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedResultIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedResultIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[selectedResultIdx]) handleAddCard(results[selectedResultIdx])
    } else if (e.key === 'Escape') {
      setSearchFocused(false)
      setQuery('')
    }
  }

  const deleteCard = async (id: string) => {
    const card = cards.find(c => c.id === id)
    await supabase.from('deck_cards').delete().eq('id', id)
    if (card) recordVersion(deckId, `Removed ${card.name}`)
  }

  const setAsCommander = async (scryfallId: string) => {
    let newIds: string[]
    if (commanderIds.includes(scryfallId)) {
      newIds = commanderIds.filter(id => id !== scryfallId)
    } else if (commanderIds.length >= 2) {
      toast.error('A deck can have at most 2 commanders. Remove one first.')
      return
    } else {
      newIds = [...commanderIds, scryfallId]
    }
    setCommanderIds(newIds)
    await supabase.from('decks').update({ commander_scryfall_ids: newIds }).eq('id', deckId)
    const card = cards.find(c => c.scryfall_id === scryfallId)
    const cardName = card?.name ?? 'card'
    const becameCmd = newIds.includes(scryfallId)
    recordVersion(deckId, becameCmd ? `Set ${cardName} as commander` : `Unset ${cardName} as commander`)
    toast.success(becameCmd ? 'Set as commander!' : 'Removed as commander')
  }

  const setAsCoverImage = async (scryfallId: string) => {
    if (coverImageId === scryfallId) {
      setCoverImageId(null)
      await supabase.from('decks').update({ cover_image_scryfall_id: null }).eq('id', deckId)
      recordVersion(deckId, 'Removed cover image')
      toast.success('Cover image removed')
    } else {
      setCoverImageId(scryfallId)
      await supabase.from('decks').update({ cover_image_scryfall_id: scryfallId }).eq('id', deckId)
      const card = cards.find(c => c.scryfall_id === scryfallId)
      recordVersion(deckId, `Set cover image to ${card?.name ?? 'card'}`)
      toast.success('Set as cover image!')
    }
  }

  const addTag = async (cardId: string, tag: string) => {
    if (!tag.trim()) return
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const currentTags = card.tags || []
    if (currentTags.includes(tag)) return
    const newTags = [...currentTags, tag]
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
    recordVersion(deckId, `Tagged ${card.name} with "${tag}"`)
  }

  const removeTag = async (cardId: string, tag: string) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const newTags = (card.tags || []).filter(t => t !== tag)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
    recordVersion(deckId, `Untagged ${card.name} from "${tag}"`)
  }

  const setCardPrinting = async (cardId: string, printingId: string | null) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    await supabase.from('deck_cards').update({ printing_scryfall_id: printingId }).eq('id', cardId)
    recordVersion(deckId, printingId
      ? `Changed ${card.name} printing`
      : `Reset ${card.name} to default printing`)
  }

  const setCardFinish = async (cardId: string, finish: 'nonfoil' | 'foil' | 'etched') => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    await supabase.from('deck_cards').update({ finish }).eq('id', cardId)
    recordVersion(deckId, `Changed ${card.name} finish to ${finish}`)
  }

  const ensurePrintingsLoaded = async (card: DeckCard) => {
    if (printingsByCard[card.id]) return
    if (!card.oracle_id) return
    const prints = await getPrintingsByOracleId(card.oracle_id)
    setPrintingsByCard(prev => ({ ...prev, [card.id]: prints }))
  }

  const handleCustomTagSubmit = () => {
    if (activeCardIdForTag && customTagInput) addTag(activeCardIdForTag, customTagInput)
    setTagDialogOpen(false)
    setCustomTagInput("")
    setActiveCardIdForTag(null)
  }

  // Keep latest addTag/fetchDeck reachable from the stable window dragend listener
  dragCallbacksRef.current = { addTag, fetchDeck }

  const allUniqueTags = Array.from(new Set([...DEFAULT_TAGS, ...cards.flatMap(c => c.tags || [])])).sort()

  const enterVersionView = async (versionId: string) => {
    const row: DeckVersionRow | null = await getVersion(versionId)
    if (!row) {
      toast.error('Version not found')
      return
    }
    const snap = row.snapshot
    const ids = new Set<string>()
    for (const c of snap.cards) ids.add(c.printing_scryfall_id || c.scryfall_id)
    if (snap.deck.cover_image_scryfall_id) ids.add(snap.deck.cover_image_scryfall_id)

    const sfCards = await getCardsByIds(Array.from(ids))
    const sfMap = new Map(sfCards.map(c => [c.id, c]))

    // Resolve a default printing for snapshot cards with no chosen printing —
    // same batched /cards/collection approach as fetchDeck.
    const oracleIdsSnap = new Set<string>()
    for (const c of snap.cards) {
      if (!c.printing_scryfall_id) {
        const oid = c.oracle_id ?? sfMap.get(c.scryfall_id)?.oracle_id
        if (oid) oracleIdsSnap.add(oid)
      }
    }
    const defaultByOracleSnap = await getOldestPrintingsByOracleIds(Array.from(oracleIdsSnap))
    for (const sf of defaultByOracleSnap.values()) sfMap.set(sf.id, sf)

    const hydrated: DeckCard[] = snap.cards.map((c, i) => {
      const baseSf = sfMap.get(c.scryfall_id)
      const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
      let effectiveId = c.printing_scryfall_id || c.scryfall_id
      if (!c.printing_scryfall_id && oracleId && defaultByOracleSnap.has(oracleId)) {
        effectiveId = defaultByOracleSnap.get(oracleId)!.id
      }
      const effSf = sfMap.get(effectiveId) ?? baseSf
      return {
        id: `snap-${i}`,
        deck_id: deckId,
        scryfall_id: c.scryfall_id,
        printing_scryfall_id: c.printing_scryfall_id,
        finish: c.finish,
        oracle_id: oracleId,
        name: c.name,
        quantity: c.quantity,
        zone: c.zone,
        tags: c.tags,
        image_url: effSf?.image_uris?.normal,
        type_line: effSf?.type_line || '',
        mana_cost: effSf?.mana_cost || '',
        cmc: effSf?.cmc ?? (effSf ? calculateCmc(effSf.mana_cost) : 0),
        colors: effSf?.colors ?? [],
        set_code: effSf?.set,
        collector_number: effSf?.collector_number,
        available_finishes: effSf?.finishes,
        price_usd: pickPrice(effSf?.prices, c.finish),
        effective_printing_id: effectiveId,
      }
    })

    const coverId = snap.deck.cover_image_scryfall_id
    const coverImageUrlSnap = coverId ? (sfMap.get(coverId)?.image_uris?.normal ?? null) : null

    setViewing({
      versionId: row.id,
      label: row.name ?? new Date(row.created_at).toLocaleString(),
      cards: hydrated,
      deckMeta: snap.deck,
      primerMarkdown: snap.primer_markdown,
      coverImageUrl: coverImageUrlSnap,
    })
  }

  const exitVersionView = () => setViewing(null)

  const handleRevertFromBanner = async () => {
    if (!viewing) return
    if (!confirm("Revert deck to this version? Your current state will be saved as a new version first.")) return
    const ok = await revertToVersion(deckId, viewing.versionId)
    if (!ok) {
      toast.error('Revert failed')
      return
    }
    toast.success('Reverted')
    setViewing(null)
    await fetchDeck()
  }

  const savePrimer = async (markdown: string) => {
    const { error } = await supabase.from('decks').update({ primer_markdown: markdown }).eq('id', deckId)
    if (error) {
      toast.error(error.message)
      return
    }
    setPrimerMarkdown(markdown)
    setPrimerEditing(false)
    recordVersion(deckId, 'Updated primer')
    toast.success('Primer saved')
  }

  // Cards displayed in the workspace: live state by default, snapshot when viewing a version.
  // Declared before getGroupedCards/totalUsd because both reference it.
  const displayedCards = viewing ? viewing.cards : cards
  const displayedCommanderIds = viewing ? viewing.deckMeta.commanders : commanderIds
  const displayedCoverImageUrl = viewing ? viewing.coverImageUrl : coverImageUrl
  const displayedDeckName = viewing ? viewing.deckMeta.name : (deck?.name || 'Loading...')

  const totalUsd = useMemo(() => {
    let sum = 0
    let anyMissing = false
    for (const c of displayedCards) {
      if (c.price_usd == null) { anyMissing = true; continue }
      sum += c.price_usd * c.quantity
    }
    return { sum, anyMissing }
  }, [displayedCards])

  const getGroupedCards = () => {
    let sorted = [...displayedCards].sort((a, b) => {
      if (sorting === 'name') return a.name.localeCompare(b.name)
      if (sorting === 'mana') return (a.cmc || 0) - (b.cmc || 0)
      return 0
    })

    if (grouping === 'none') return { 'All Cards': sorted }

    const groups: Record<string, DeckCard[]> = {}

    if (grouping === 'tag') {
      sorted.forEach(c => {
        if (!c.tags || c.tags.length === 0) {
          if (!groups['Untagged']) groups['Untagged'] = []
          groups['Untagged'].push(c)
        } else {
          c.tags.forEach(tag => {
            if (!groups[tag]) groups[tag] = []
            groups[tag].push(c)
          })
        }
      })
      return groups
    }

    sorted.forEach(c => {
      let key = 'Other'
      if (grouping === 'type') {
        if (c.type_line?.includes('Creature')) key = 'Creature'
        else if (c.type_line?.includes('Instant')) key = 'Instant'
        else if (c.type_line?.includes('Sorcery')) key = 'Sorcery'
        else if (c.type_line?.includes('Artifact')) key = 'Artifact'
        else if (c.type_line?.includes('Enchantment')) key = 'Enchantment'
        else if (c.type_line?.includes('Planeswalker')) key = 'Planeswalker'
        else if (c.type_line?.includes('Land')) key = 'Land'
      } else if (grouping === 'mana') {
        key = `Mana Value ${c.cmc || 0}`
      }
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })
    return groups
  }

  const groupedCards = getGroupedCards()

  // Shared dropdown menu items rendered inside both ContextMenu and DropdownMenu
  const renderDropdownItems = (c: DeckCard, groupName: string) => {
    const printings = printingsByCard[c.id] ?? []
    const finishes = c.available_finishes ?? ['nonfoil']
    return (
      <>
        <DropdownMenuItem
          onClick={() => setAsCommander(c.scryfall_id)}
          className={commanderIds.includes(c.scryfall_id) ? 'text-yellow-400' : ''}
        >
          <Crown className="w-3.5 h-3.5 mr-2" />
          {commanderIds.includes(c.scryfall_id) ? 'Remove as Commander' : 'Set as Commander'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setAsCoverImage(c.scryfall_id)}
          className={coverImageId === c.scryfall_id ? 'text-blue-400' : ''}
        >
          <ImageIcon className="w-3.5 h-3.5 mr-2" />
          {coverImageId === c.scryfall_id ? 'Remove Cover Image' : 'Set as Cover Image'}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onMouseEnter={() => void ensurePrintingsLoaded(c)}>Printing</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-card border-border text-foreground max-h-80 overflow-y-auto">
            <DropdownMenuItem
              className={c.printing_scryfall_id == null ? 'text-primary' : ''}
              onClick={() => setCardPrinting(c.id, null)}
            >
              Default (oldest)
            </DropdownMenuItem>
            {printings.length > 0 && <DropdownMenuSeparator className="bg-border" />}
            {printings.map(p => (
              <DropdownMenuItem
                key={p.id}
                className={c.printing_scryfall_id === p.id ? 'text-primary' : ''}
                onClick={() => setCardPrinting(c.id, p.id)}
              >
                <span className="font-mono text-xs mr-2 text-muted-foreground">{p.set?.toUpperCase()}</span>
                {p.set_name}
                <span className="ml-auto text-xs text-muted-foreground">{(p.released_at ?? '').slice(0, 4)}</span>
              </DropdownMenuItem>
            ))}
            {printings.length === 0 && c.oracle_id && (
              <DropdownMenuItem disabled>Loading printings…</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Foil</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-card border-border text-foreground">
            <DropdownMenuItem
              disabled={!finishes.includes('nonfoil')}
              className={c.finish === 'nonfoil' ? 'text-primary' : ''}
              onClick={() => setCardFinish(c.id, 'nonfoil')}
            >Non-foil</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!finishes.includes('foil')}
              className={c.finish === 'foil' ? 'text-primary' : ''}
              onClick={() => setCardFinish(c.id, 'foil')}
            >Foil</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!finishes.includes('etched')}
              className={c.finish === 'etched' ? 'text-primary' : ''}
              onClick={() => setCardFinish(c.id, 'etched')}
            >Etched</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Tags</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-card border-border text-foreground">
            {allUniqueTags.map(tag => (
              <DropdownMenuItem key={tag} onClick={() => addTag(c.id, tag)}>{tag}</DropdownMenuItem>
            ))}
            {allUniqueTags.length > 0 && <DropdownMenuSeparator className="bg-border" />}
            <DropdownMenuItem onClick={() => { setActiveCardIdForTag(c.id); setTagDialogOpen(true) }}>Add Custom Tag...</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-border" />
        {grouping === 'tag' && groupName !== 'Untagged' && (
          <>
            <DropdownMenuItem className="text-orange-400" onClick={() => removeTag(c.id, groupName)}>
              Remove from &apos;{groupName}&apos;
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
          </>
        )}
        <DropdownMenuItem className="text-destructive" onClick={() => deleteCard(c.id)}>Remove from Deck</DropdownMenuItem>
      </>
    )
  }

  // Render as a plain function (not a component) so React doesn't remount it on parent re-renders
  const renderThreeDotMenu = (c: DeckCard, groupName: string, align: 'start' | 'end' = 'end') => {
    if (!isOwner || viewing) return null
    return (
      <DropdownMenu onOpenChange={(o) => { if (o) void ensurePrintingsLoaded(c) }}>
        <DropdownMenuTrigger
          className="h-7 w-7 flex items-center justify-center bg-background/75 hover:bg-background/95 rounded-full border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onContextMenu={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56 bg-card border-border text-foreground">
          {renderDropdownItems(c, groupName)}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (accessDenied) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">This deck is private</h1>
        <p className="text-muted-foreground mb-6">You don&apos;t have access to view this deck.</p>
        <Button onClick={() => router.push('/decks')}>Back to my decks</Button>
      </div>
    )
  }

  const interactionsLocked = !isOwner || !!viewing

  return (
    <div className="fixed top-14 inset-x-0 bottom-0 flex flex-col overflow-hidden bg-background font-sans text-foreground">

      {viewing && (
        <ViewingVersionBanner
          versionLabel={viewing.label}
          isOwner={isOwner}
          onRevert={handleRevertFromBanner}
          onBackToLatest={exitVersionView}
        />
      )}

      {/* Combined toolbar: title | search | controls — banner with cover image background */}
      <header className="border-b border-border h-28 shrink-0 relative z-40">
        {/* Background: cover image with gradient overlay (clipped to banner), or fallback */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {displayedCoverImageUrl ? (
            <>
              <img
                src={displayedCoverImageUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-secondary/95 via-secondary/70 to-secondary/30" />
              <div className="absolute inset-0 backdrop-blur-[2px]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-secondary/80 backdrop-blur-md" />
          )}
        </div>

        {/* Foreground: toolbar pinned to bottom */}
        <div className="absolute inset-x-0 bottom-0 h-14 flex items-center gap-3 px-4">
        {/* Left: back + deck title */}
        <Button variant="ghost" size="sm" onClick={() => router.push(isOwner ? '/decks' : '/')} className="text-muted-foreground hover:text-foreground shrink-0">
          &larr; Back
        </Button>
        <div className="flex items-center gap-2 shrink-0 border-r border-border pr-3">
          <h1 className="font-bold text-base whitespace-nowrap drop-shadow-md">{displayedDeckName}</h1>
          <Badge variant="outline" className="border-border text-muted-foreground shrink-0 bg-background/40 backdrop-blur-sm">
            {displayedCards.reduce((a, c) => a + c.quantity, 0)}
          </Badge>
          <Badge variant="outline" className="border-border text-muted-foreground shrink-0 bg-background/40 backdrop-blur-sm font-mono" title={totalUsd.anyMissing ? "Some cards have no price data" : undefined}>
            {formatPrice(totalUsd.sum)}{totalUsd.anyMissing ? "+" : ""}
          </Badge>
          {deck && !deck.is_public && (
            <Badge className="bg-muted text-muted-foreground border-border">Private</Badge>
          )}
        </div>

        {/* Center: add-a-card search (owner-only, decklist tab only, not while viewing a version) */}
        {!interactionsLocked && tab === 'decklist' ? (
        <div ref={searchContainerRef} className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Add a card..."
            className="pl-9 pr-4 bg-background/60 border-border text-foreground h-9 w-full"
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchFocused(true) }}
            onFocus={() => setSearchFocused(true)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchFocused && results.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-50">
              <div className="max-h-80 overflow-y-auto">
                {results.slice(0, 10).map((card, idx) => (
                  <div
                    key={card.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                      idx === selectedResultIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                    }`}
                    onMouseEnter={() => setSelectedResultIdx(idx)}
                    onClick={() => handleAddCard(card)}
                  >
                    {card.image_uris && (
                      <img
                        src={card.image_uris.small ?? card.image_uris.normal}
                        className="w-7 h-auto rounded shrink-0"
                        draggable={false}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{card.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 ml-2">{card.mana_cost}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        ) : (
          <div className="flex-1 min-w-0" />
        )}

        {/* Right: group + view controls (decklist tab only) + settings (owner only) */}
        <div className="flex items-center gap-2 shrink-0">
          {tab === 'decklist' && (
            <>
              <Select value={grouping} onValueChange={(v) => setGrouping(v as GroupingMode)}>
                <SelectTrigger className="w-32 bg-card border-border h-8 text-foreground">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="none">No Grouping</SelectItem>
                  <SelectItem value="type">By Type</SelectItem>
                  <SelectItem value="mana">By Mana Cost</SelectItem>
                  <SelectItem value="tag">By Tags</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="bg-card rounded-md p-0.5 border border-border">
                <TabsList className="h-7 bg-transparent">
                  <TabsTrigger value="visual" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><LayoutGrid className="w-3.5 h-3.5" /></TabsTrigger>
                  <TabsTrigger value="stack" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><StackIcon className="w-3.5 h-3.5" /></TabsTrigger>
                  <TabsTrigger value="list" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><List className="w-3.5 h-3.5" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
          {isOwner && !viewing && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-card border border-border hover:bg-accent text-foreground"
              title="Deck settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
        </div>
      </header>

      <DeckTabs tab={tab} onChange={setTab} />

      {/* Workspace */}
      <div className="flex-1 overflow-y-auto bg-background/20">
        <div className="p-6 max-w-6xl mx-auto space-y-8">
        {tab === 'decklist' && (<>
          {cardsLoading && cards.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[5/7] rounded-xl border border-border/30 bg-card/30 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
                </div>
              ))}
            </div>
          )}
          {Object.entries(groupedCards)
            .sort(([a], [b]) => {
              if (a === 'Untagged') return 1
              if (b === 'Untagged') return -1
              return 0
            })
            .map(([groupName, groupCards]) => (
            <div
              key={groupName}
              onDragOver={(e) => { if (grouping === 'tag') e.preventDefault() }}
              onDrop={(e) => {
                if (grouping === 'tag' && groupName !== 'Untagged') {
                  pendingDrop.current = { cardId: e.dataTransfer.getData('cardId'), tag: groupName }
                }
              }}
            >
              <h3 className="text-xl font-bold border-b border-border pb-2 mb-4 text-foreground">
                {groupName}{' '}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({groupCards.reduce((a, c) => a + c.quantity, 0)})
                </span>
              </h3>

              {/* ── VISUAL VIEW ── */}
              {viewMode === 'visual' && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                  {groupCards.map(c => (
                    <ContextMenu key={c.id}>
                      <ContextMenuTrigger>
                        <div
                          className={`relative rounded-xl overflow-hidden border cursor-grab active:cursor-grabbing shadow-xl group aspect-[5/7] transition-all ${
                            commanderIds.includes(c.scryfall_id)
                              ? 'border-yellow-400/80 ring-2 ring-yellow-400/40 hover:border-yellow-300'
                              : coverImageId === c.scryfall_id
                                ? 'border-blue-400/80 ring-2 ring-blue-400/40 hover:border-blue-300'
                                : 'border-border hover:border-primary/50'
                          }`}
                          draggable
                          onDragStart={(e) => { isDragging.current = true; e.dataTransfer.setData('cardId', c.id) }}
                        >
                          {c.image_url
                            ? <img src={c.image_url} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center bg-card/50"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
                          }
                          {commanderIds.includes(c.scryfall_id) && (
                            <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg">
                              <Crown className="w-2.5 h-2.5" /> CMD
                            </div>
                          )}
                          {coverImageId === c.scryfall_id && (
                            <div
                              className="absolute left-2 bg-blue-400/90 text-blue-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg"
                              style={{ top: commanderIds.includes(c.scryfall_id) ? '1.75rem' : '0.5rem' }}
                            >
                              <ImageIcon className="w-2.5 h-2.5" /> Cover
                            </div>
                          )}
                          {c.quantity > 1 && (
                            <div className="absolute top-2 right-8 bg-background/80 text-foreground px-1.5 py-0.5 rounded text-xs font-bold border border-border group-hover:opacity-0 transition-opacity">
                              x{c.quantity}
                            </div>
                          )}
                          {c.tags && c.tags.length > 0 && (
                            <div className="absolute bottom-1 left-1 flex flex-wrap gap-1 p-1 max-w-[60%]">
                              {c.tags.map(t => (
                                <Badge key={t} className="text-[10px] px-1.5 py-0 bg-background/80 text-foreground border-border truncate max-w-full">{t}</Badge>
                              ))}
                            </div>
                          )}
                          {/* Cost badge (bottom-right) */}
                          <div className="absolute bottom-1 right-1 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                            {formatPrice(c.price_usd)}
                          </div>
                          {/* Set/finish indicator (top-left under commander/cover badges) */}
                          {(c.printing_scryfall_id || c.finish !== 'nonfoil') && c.set_code && (
                            <div className="absolute top-2 right-9 bg-background/80 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border border-border">
                              {c.set_code}{c.finish === 'foil' ? ' ★' : c.finish === 'etched' ? ' ✦' : ''}
                            </div>
                          )}
                          {/* Three-dot menu */}
                          <div className="absolute top-1.5 right-1.5 z-20">
                            {renderThreeDotMenu(c, groupName, 'end')}
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-card border-border text-foreground">
                        <ContextMenuItem
                          onClick={() => setAsCommander(c.scryfall_id)}
                          className={commanderIds.includes(c.scryfall_id) ? 'text-yellow-400 focus:text-yellow-300 focus:bg-yellow-400/10' : ''}
                        >
                          <Crown className="w-3.5 h-3.5 mr-2" />
                          {commanderIds.includes(c.scryfall_id) ? 'Remove as Commander' : 'Set as Commander'}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => setAsCoverImage(c.scryfall_id)}
                          className={coverImageId === c.scryfall_id ? 'text-blue-400 focus:text-blue-300 focus:bg-blue-400/10' : ''}
                        >
                          <ImageIcon className="w-3.5 h-3.5 mr-2" />
                          {coverImageId === c.scryfall_id ? 'Remove Cover Image' : 'Set as Cover Image'}
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-border" />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-card border-border text-foreground">
                            {allUniqueTags.map(tag => (
                              <ContextMenuItem key={tag} onClick={() => addTag(c.id, tag)}>{tag}</ContextMenuItem>
                            ))}
                            {allUniqueTags.length > 0 && <ContextMenuSeparator className="bg-border" />}
                            <ContextMenuItem onClick={() => { setActiveCardIdForTag(c.id); setTagDialogOpen(true) }}>Add Custom Tag...</ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator className="bg-border" />
                        {grouping === 'tag' && groupName !== 'Untagged' && (
                          <>
                            <ContextMenuItem className="text-orange-400 focus:text-orange-300 focus:bg-orange-400/10" onClick={() => removeTag(c.id, groupName)}>
                              Remove from &apos;{groupName}&apos;
                            </ContextMenuItem>
                            <ContextMenuSeparator className="bg-border" />
                          </>
                        )}
                        <ContextMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => deleteCard(c.id)}>
                          Remove from Deck
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              )}

              {/* ── STACK VIEW ── */}
              {viewMode === 'stack' && (() => {
                // Up to 3 columns; card 0 is rearmost (top of fan), last card is frontmost
                const numCols = Math.min(3, Math.max(1, Math.ceil(groupCards.length / 5)))
                const colSize = Math.ceil(groupCards.length / numCols)
                const columns = Array.from({ length: numCols }, (_, ci) =>
                  groupCards.slice(ci * colSize, (ci + 1) * colSize)
                )

                return (
                  <div className="flex gap-8 flex-wrap">
                    {columns.map((colCards, colIdx) => {
                      // Compute static base top positions; card 0 at top (rearmost)
                      const basePositions: number[] = []
                      let accY = 0
                      colCards.forEach(card => {
                        basePositions.push(accY)
                        accY += STACK_PEEK + (card.quantity > 1 ? STACK_EXTRA_PEEK : 0)
                      })
                      const colHeight = accY + STACK_CARD_HEIGHT + STACK_HOVER_SHIFT

                      return (
                        <div
                          key={colIdx}
                          className="relative shrink-0 w-44"
                          style={{ height: colHeight }}
                          onMouseMove={(e) => {
                            // Determine active card from mouse Y within the column,
                            // bypassing z-index blocking on individual card elements.
                            const rect = e.currentTarget.getBoundingClientRect()
                            const mouseY = e.clientY - rect.top
                            let activeIdx = 0
                            for (let i = 1; i < colCards.length; i++) {
                              if (mouseY >= basePositions[i]) activeIdx = i
                              else break
                            }
                            setHoveredStack({ groupName, colIdx, itemIdx: activeIdx })
                          }}
                          onMouseLeave={() => setHoveredStack(null)}
                        >
                          {colCards.map((card, itemIdx) => {
                            const isHovered = !!hoveredStack
                              && hoveredStack.groupName === groupName
                              && hoveredStack.colIdx === colIdx
                              && hoveredStack.itemIdx === itemIdx
                            const isBelow = !!hoveredStack
                              && hoveredStack.groupName === groupName
                              && hoveredStack.colIdx === colIdx
                              && itemIdx > hoveredStack.itemIdx

                            return (
                              <motion.div
                                key={card.id}
                                className="absolute w-full cursor-grab active:cursor-grabbing group"
                                draggable
                                onDragStartCapture={(e) => { isDragging.current = true; e.dataTransfer.setData('cardId', card.id) }}
                                style={{
                                  top: basePositions[itemIdx],
                                  // Higher index = more in front; card 0 is rearmost
                                  zIndex: isHovered ? colCards.length + 10 : itemIdx + 1,
                                }}
                                animate={{
                                  y: isHovered ? -12 : isBelow ? STACK_HOVER_SHIFT : 0,
                                  scale: isHovered ? 1.05 : 1,
                                }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.4 }}
                              >
                                {card.image_url
                                  ? <img src={card.image_url} className="w-full rounded-xl border border-black/60 shadow-xl" draggable={false} />
                                  : <div className="w-full aspect-[5/7] rounded-xl border border-border/40 bg-card/50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
                                }
                                {card.quantity > 1 && (
                                  <div className="absolute top-2 right-2 bg-background/85 text-foreground text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-border/60 shadow-sm leading-none">
                                    {card.quantity}x
                                  </div>
                                )}
                                {commanderIds.includes(card.scryfall_id) && (
                                  <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-0.5 shadow">
                                    <Crown className="w-2.5 h-2.5" /> CMD
                                  </div>
                                )}
                                {/* Three-dot menu (top-right) */}
                                <div className="absolute top-2 right-2 z-10">
                                  {renderThreeDotMenu(card, groupName, 'end')}
                                </div>
                                {/* Cost (bottom-right) */}
                                {itemIdx === colCards.length - 1 && (
                                  <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                                    {formatPrice(card.price_usd)}
                                  </div>
                                )}
                              </motion.div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── LIST VIEW ── */}
              {viewMode === 'list' && (
                <div className="bg-card/50 rounded-lg border border-border">
                  {groupCards.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2 hover:bg-accent/50 border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg group relative cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => { isDragging.current = true; e.dataTransfer.setData('cardId', c.id) }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground w-4 text-right font-mono">{c.quantity}</span>
                        <span className="font-medium cursor-pointer hover:text-primary transition-colors">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.mana_cost}</span>
                      </div>
                      {/* Hover image preview */}
                      <div className="hidden group-hover:block absolute left-1/3 top-0 -translate-y-1/2 z-50 pointer-events-none drop-shadow-2xl">
                        <img src={c.image_url} className="w-48 rounded-xl border border-border/50" />
                      </div>
                      <div className="flex items-center gap-3 ml-auto">
                        <span className="text-xs font-mono text-muted-foreground tabular-nums w-16 text-right">
                          {formatPrice(c.price_usd)}
                        </span>
                        {renderThreeDotMenu(c, groupName, 'end')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* ── Analytics ── */}
          <div className="border-t border-border pt-8 mt-4">
            <DeckAnalytics
              cards={displayedCards.filter(c => !displayedCommanderIds.includes(c.scryfall_id))}
              commanders={displayedCards.filter(c => displayedCommanderIds.includes(c.scryfall_id))}
            />
          </div>
        </>)}

        {tab === 'primer' && (
          <div className="space-y-4">
            {!viewing && isOwner && !primerEditing && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setPrimerEditing(true)}>
                  <EditIcon className="w-3.5 h-3.5 mr-1.5" /> Edit Primer
                </Button>
              </div>
            )}
            {primerEditing && !viewing ? (
              <PrimerEditor
                initial={primerMarkdown || defaultPrimerSeed(displayedDeckName)}
                onSave={savePrimer}
                onCancel={() => setPrimerEditing(false)}
              />
            ) : (
              <PrimerView markdown={viewing ? viewing.primerMarkdown : primerMarkdown} />
            )}
          </div>
        )}

        {tab === 'versions' && (
          <VersionsTab
            deckId={deckId}
            isOwner={isOwner}
            onViewVersion={(id) => { setTab('decklist'); void enterVersionView(id) }}
            onReverted={() => { setViewing(null); void fetchDeck() }}
          />
        )}
        </div>
      </div>

      {deck && (
        <DeckSettingsDialog
          deckId={deckId}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initial={{
            name: deck.name ?? "",
            description: deck.description ?? null,
            format: deck.format ?? null,
            is_public: !!deck.is_public,
          }}
          onSaved={(next) => setDeck({ ...deck, ...next })}
        />
      )}

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Custom Tag</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={customTagInput}
              onChange={e => setCustomTagInput(e.target.value)}
              placeholder="e.g. Win Condition"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              onKeyDown={e => { if (e.key === 'Enter') handleCustomTagSubmit() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagDialogOpen(false)} className="hover:bg-accent hover:text-accent-foreground">Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleCustomTagSubmit}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
