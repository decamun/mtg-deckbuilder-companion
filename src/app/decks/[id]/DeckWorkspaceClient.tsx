"use client"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { Edit as EditIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"
import {
  searchCards,
  getCard,
  getPrintingsByOracleId,
  cmcOf,
  getCardFaceImages,
  getCardImageUrl,
  rulesTextForDisplay,
  type ScryfallCard,
  type ScryfallPrinting,
} from "@/lib/scryfall"
import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { DeckTabs, type DeckTab } from "@/components/deck/DeckTabs"
import { ViewingVersionBanner } from "@/components/versions/ViewingVersionBanner"
import { getVersion, recordVersion, revertToVersion, flushPendingVersion, type DeckVersionRow } from "@/lib/versions"
import { pickPrice } from "@/lib/format"
import { hasLandFaceOnTypeLine } from "@/lib/card-types"
import {
  getFormatValidationDataVersion,
  validateDeckForFormat,
} from "@/lib/deck-format-validation"
import { useTopNavDeckGuest } from "@/components/TopNavDeckGuestContext"
import { useDeckWorkspaceFetch } from "./use-deck-workspace-fetch"
import { hydrateVersionSnapshot } from "./deck-workspace-version-hydrate"
import {
  CARD_INTERACTION_SETTLE_MS,
  DEFAULT_CARD_SIZE,
  DEFAULT_TAGS,
  STACK_CARD_HEIGHT_RATIO,
  STACK_EXTRA_PEEK_RATIO,
  STACK_HOVER_SHIFT_RATIO,
  STACK_PEEK_RATIO,
  TAG_GROUP_UNTAGGED,
} from "./deck-workspace-constants"
import { loadDeckWorkspaceDisplayPrefs, saveDeckWorkspaceDisplayPrefs } from "./deck-workspace-display-prefs"
import {
  defaultPrimerSeed,
  groupDeckCards,
  mergeDeckCardRow,
  normalizeTagForStorage,
  parseDeckCardDragId,
} from "./deck-workspace-pure"
import type { CardInteractionPhase, DeckCardRow, DiffTargetState, ViewingSnapshotState } from "./deck-workspace-types"
import { DeckWorkspaceHeader } from "./DeckWorkspaceHeader"
import { DeckWorkspaceDecklistToolbar } from "./DeckWorkspaceDecklistToolbar"
import { DeckWorkspaceGroupedDecklist } from "./DeckWorkspaceGroupedDecklist"
import { DeckWorkspaceCommanderRail } from "./DeckWorkspaceCommanderRail"
import { DeckWorkspaceDialogsSection } from "./DeckWorkspaceDialogsSection"
import type { DeckWorkspaceOverflowMenusProps } from "./deck-workspace-overflow-menus"
import type { DeckRulesHoverPayload } from "./DeckWorkspaceCardRulesPreview"
import { REGISTRY_ZONE_IDS, sanitizeCustomZoneId, validateCustomZoneName } from "@/lib/zones"

const DeckWorkspaceBoardsTab = dynamic(
  () => import("./DeckWorkspaceBoardsTab").then((m) => ({ default: m.DeckWorkspaceBoardsTab })),
  { ssr: false }
)

const DeckAgentSidebar = dynamic(
  () => import("@/components/agent/DeckAgentSidebar").then((m) => ({ default: m.DeckAgentSidebar })),
  { ssr: false }
)
const DeckSettingsDialog = dynamic(
  () => import("@/components/deck/DeckSettingsDialog").then((m) => ({ default: m.DeckSettingsDialog })),
  { ssr: false }
)
const ImportDecklistDialog = dynamic(
  () => import("@/components/deck/ImportDecklistDialog").then((m) => ({ default: m.ImportDecklistDialog })),
  { ssr: false }
)
const PrimerView = dynamic(
  () => import("@/components/primer/PrimerView").then((m) => ({ default: m.PrimerView })),
  { ssr: false }
)
const PrimerEditor = dynamic(
  () => import("@/components/primer/PrimerEditor").then((m) => ({ default: m.PrimerEditor })),
  { ssr: false }
)
const VersionsTab = dynamic(
  () => import("@/components/versions/VersionsTab").then((m) => ({ default: m.VersionsTab })),
  { ssr: false }
)

export default function DeckWorkspaceClient({
  deckId,
  initialDeckName = null,
}: {
  deckId: string
  initialDeckName?: string | null
}) {
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
  const [sorting, setSorting] = useState<SortingMode>('mana')
  const debouncedQuery = useDebounce(query, 300)

  const [commanderIds, setCommanderIds] = useState<string[]>([])
  const [coverImageId, setCoverImageId] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)

  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState("")
  const [activeCardIdForTag, setActiveCardIdForTag] = useState<string | null>(null)

  const [boardDialogOpen, setBoardDialogOpen] = useState(false)
  const [customBoardInput, setCustomBoardInput] = useState("")
  const [customBoardError, setCustomBoardError] = useState<string | null>(null)
  const [activeCardIdForBoard, setActiveCardIdForBoard] = useState<string | null>(null)

  const [hoveredStack, setHoveredStack] = useState<{ groupName: string; colIdx: number; itemIdx: number } | null>(null)
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [agentOpen, setAgentOpen] = useState(false)

  // One-shot sync from localStorage (guest + signed-in); cannot read during SSR render.
  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate decklist toolbar prefs from localStorage */
    const p = loadDeckWorkspaceDisplayPrefs()
    setViewMode(p.viewMode)
    setGrouping(p.grouping)
    setSorting(p.sorting)
    setCardSize(p.cardSize)
    // Match Tailwind `md`: assistant expanded on desktop, collapsed on narrow viewports (before first paint).
    setAgentOpen(window.matchMedia("(min-width: 768px)").matches)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  const toggleSection = (name: string) => setCollapsedSections(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<{ el: HTMLElement; top: number } | null>(null)
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current
    if (!anchor || !scrollContainerRef.current) return
    scrollAnchorRef.current = null
    const delta = anchor.el.getBoundingClientRect().top - anchor.top
    scrollContainerRef.current.scrollTop += delta
  })
  const toggleAllSections = (allNames: string[], anchorEl: HTMLElement) => {
    scrollAnchorRef.current = { el: anchorEl, top: anchorEl.getBoundingClientRect().top }
    setCollapsedSections(prev => prev.size === allNames.length ? new Set() : new Set(allNames))
  }
  const [clickedPreview, setClickedPreview] = useState<{ card: DeckCard; groupName: string } | null>(null)
  const [previewFaceIndex, setPreviewFaceIndex] = useState(0)
  const [readyCardInteractionKey, setReadyCardInteractionKey] = useState<string | null>(null)
  /** After closing a ⋮ menu in the format-hints dialog, ignore row clicks for a short window (ghost click-through). */
  const formatHintsMenuClosedAtRef = useRef(0)

  // New: ownership, tabs, settings, primer, version-viewing
  const [isOwner, setIsOwner] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const tabParam = (searchParams?.get("tab") ?? null) as DeckTab | null
  const [tab, setTabState] = useState<DeckTab>(tabParam ?? "decklist")
  const setTab = (t: DeckTab) => {
    setTabState(t)
    if (t !== "decklist") setRulesHover(null)
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
  const [diffTarget, setDiffTarget] = useState<DiffTargetState | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [formatHintsListOpen, setFormatHintsListOpen] = useState(false)
  const [deckFormatHintHoverId, setDeckFormatHintHoverId] = useState<string | null>(null)
  const [previewFormatHintsHovered, setPreviewFormatHintsHovered] = useState(false)
  const [rulesHover, setRulesHover] = useState<DeckRulesHoverPayload>(null)
  /** Deck workspace header chrome only — toggled by scrolling the decklist area. */
  const [deckChromeCollapsed, setDeckChromeCollapsed] = useState(false)

  // Active board/zone selector (for decklist view filtering)
  const [activeZone, setActiveZone] = useState<string>("mainboard")

  const [deckTitleEditing, setDeckTitleEditing] = useState(false)
  const [deckTitleDraft, setDeckTitleDraft] = useState("")
  const [deckTitleSaving, setDeckTitleSaving] = useState(false)
  const deckTitleFieldRef = useRef<HTMLDivElement>(null)
  const skipDeckTitleBlurCommitRef = useRef(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  const [agentRailInsetPx, setAgentRailInsetPx] = useState(0)
  const dockRightInsetPx = isOwner && !viewing ? agentRailInsetPx : 0

  const onDeckCardRulesPreviewHover = useCallback((card: DeckCard | null) => {
    setRulesHover((prev) => {
      if (card) return { kind: "deck", card }
      return prev?.kind === "deck" ? null : prev
    })
  }, [])

  const onSearchResultRulesHover = useCallback((card: ScryfallCard | null) => {
    setRulesHover((prev) => {
      if (card) return { kind: "scryfall", card }
      return prev?.kind === "scryfall" ? null : prev
    })
  }, [])

  const endSearchDropdown = useCallback(() => {
    setSearchFocused(false)
    setRulesHover((prev) => (prev?.kind === "scryfall" ? null : prev))
  }, [])

  const { setGuestDeckNav, deckEditorScrollCompact, setDeckEditorScrollCompact } =
    useTopNavDeckGuest()

  useEffect(() => {
    if (accessDenied) return
    const el = scrollContainerRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = el.scrollTop
        setDeckChromeCollapsed((prev) => {
          if (y > 48 && !prev) return true
          if (y < 10 && prev) return false
          return prev
        })
      })
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [tab, deckId, accessDenied])

  /** Site top nav: stay expanded until the deck is ready, then animate to the default compact bar. */
  useEffect(() => {
    if (accessDenied || !deck || deck.id !== deckId) {
      setDeckEditorScrollCompact(false)
      return () => {
        setDeckEditorScrollCompact(false)
      }
    }
    if (cardsLoading) {
      setDeckEditorScrollCompact(false)
      return () => {
        setDeckEditorScrollCompact(false)
      }
    }
    let cancelled = false
    let innerRaf = 0
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        if (!cancelled) setDeckEditorScrollCompact(true)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(outerRaf)
      cancelAnimationFrame(innerRaf)
      setDeckEditorScrollCompact(false)
    }
  }, [accessDenied, deck, deckId, cardsLoading, setDeckEditorScrollCompact])

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const recordMutationVersion = (summary: string, sinceIso: string) => {
    recordVersion(deckId, summary, sinceIso)
  }

  useEffect(() => {
    if (!deckTitleEditing) return
    const input = deckTitleFieldRef.current?.querySelector("input")
    if (!input) return
    input.focus()
    input.select()
  }, [deckTitleEditing])

  const commitDeckTitleEdit = useCallback(async () => {
    const d = deck
    if (!d) return
    const trimmed = deckTitleDraft.trim()
    if (!trimmed) {
      toast.error("Name is required")
      setDeckTitleDraft(d.name ?? "")
      queueMicrotask(() => {
        const input = deckTitleFieldRef.current?.querySelector("input")
        input?.focus()
      })
      return
    }
    if (trimmed === d.name) {
      setDeckTitleEditing(false)
      return
    }
    setDeckTitleSaving(true)
    const versionSince = new Date().toISOString()
    const { error } = await supabase.from("decks").update({ name: trimmed }).eq("id", deckId)
    setDeckTitleSaving(false)
    if (error) {
      toast.error(error.message)
      setDeckTitleDraft(d.name ?? "")
      return
    }
    recordVersion(deckId, `renamed to "${trimmed}"`, versionSince)
    setDeck(prev => (prev ? { ...prev, name: trimmed } : null))
    setDeckTitleEditing(false)
    toast.success("Name updated")
  }, [deck, deckTitleDraft, deckId])

  useEffect(() => {
    if (tab === 'versions') void flushPendingVersion(deckId)
  }, [tab, deckId])

  useEffect(() => {
    return () => { void flushPendingVersion(deckId) }
  }, [deckId])

  useEffect(() => {
    if (debouncedQuery.length > 1) {
      searchCards(debouncedQuery).then(setResults)
    } else {
      queueMicrotask(() => setResults([]))
    }
  }, [debouncedQuery])

  useEffect(() => {
    queueMicrotask(() => setSelectedResultIdx(0))
  }, [results])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        endSearchDropdown()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [endSearchDropdown])

  useEffect(() => {
    if (!clickedPreview) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClickedPreview(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clickedPreview])

  const { fetchDeck } = useDeckWorkspaceFetch(deckId, {
    setAccessDenied,
    setIsOwner,
    setDeck,
    setCommanderIds,
    setCoverImageId,
    setPrimerMarkdown,
    setCards,
    setCardsLoading,
    setCoverImageUrl,
  })

  useEffect(() => {
    if (!deck || deck.id !== deckId || accessDenied) {
      setGuestDeckNav(false)
      return
    }
    setGuestDeckNav(!isOwner)
    return () => setGuestDeckNav(false)
  }, [deck, deckId, accessDenied, isOwner, setGuestDeckNav])

  const addToDeck = async (card: ScryfallCard) => {
    const existing = cards.find(c => c.scryfall_id === card.id)
    const versionSince = new Date().toISOString()
    if (existing) {
      const nextQuantity = existing.quantity + 1
      setCards(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: nextQuantity } : c))
      const { data, error } = await supabase.from('deck_cards').update({ quantity: nextQuantity }).eq('id', existing.id).select().single()
      if (error) {
        setCards(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: existing.quantity } : c))
        toast.error(error.message)
      } else if (data) {
        setCards(prev => prev.map(c => c.id === existing.id ? mergeDeckCardRow(c, data as DeckCardRow) : c))
        recordMutationVersion(`Increased ${existing.name} to ${nextQuantity}`, versionSince)
      }
    } else {
      const optimisticId = `pending-${card.id}`
      const optimisticCard: DeckCard = {
        id: optimisticId,
        deck_id: deckId,
        scryfall_id: card.id,
        oracle_id: card.oracle_id ?? null,
        printing_scryfall_id: null,
        finish: 'nonfoil',
        name: card.name,
        quantity: 1,
        zone: 'mainboard',
        tags: [],
        image_url: getCardImageUrl(card),
        face_images: getCardFaceImages(card),
        type_line: card.type_line || '',
        mana_cost: card.mana_cost || '',
        cmc: cmcOf(card),
        colors: card.colors ?? [],
        color_identity: card.color_identity ?? [],
        legalities: card.legalities,
        oracle_text: rulesTextForDisplay(card) || card.oracle_text || "",
        set_code: card.set,
        collector_number: card.collector_number,
        available_finishes: card.finishes,
        price_usd: pickPrice(card.prices, 'nonfoil'),
        rarity: card.rarity,
        effective_printing_id: card.id,
      }
      setCards(prev => [...prev, optimisticCard])
      const { data, error } = await supabase.from('deck_cards').insert({
        deck_id: deckId,
        scryfall_id: card.id,
        oracle_id: card.oracle_id ?? null,
        printing_scryfall_id: null,
        finish: 'nonfoil',
        name: card.name,
        quantity: 1,
      }).select().single()
      if (error) {
        setCards(prev => prev.filter(c => c.id !== optimisticId))
        toast.error(error.message)
      } else if (data) {
        setCards(prev => prev.map(c => c.id === optimisticId ? { ...optimisticCard, ...data } : c))
        recordMutationVersion(`Added ${card.name}`, versionSince)
      }
    }
  }

  const handleAddCard = (card: ScryfallCard) => {
    addToDeck(card)
    setQuery('')
    setResults([])
    endSearchDropdown()
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
      endSearchDropdown()
      setQuery('')
    }
  }

  const deleteCard = async (id: string) => {
    if (clickedPreview?.card.id === id) setClickedPreview(null)
    const card = cards.find(c => c.id === id)
    if (!card) return
    const versionSince = new Date().toISOString()
    setCards(prev => prev.filter(c => c.id !== id))
    const { error } = await supabase.from('deck_cards').delete().eq('id', id)
    if (error) {
      setCards(prev => [...prev, card])
      toast.error(error.message)
    } else {
      recordMutationVersion(`Removed ${card.name}`, versionSince)
    }
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
    const previousIds = commanderIds
    const versionSince = new Date().toISOString()
    setCommanderIds(newIds)
    const { error } = await supabase.from('decks').update({ commander_scryfall_ids: newIds }).eq('id', deckId)
    if (error) {
      setCommanderIds(previousIds)
      toast.error(error.message)
      return
    }
    const becameCmd = newIds.includes(scryfallId)
    const card = cards.find(c => c.scryfall_id === scryfallId)
    const cardName = card?.name ?? 'card'
    recordMutationVersion(becameCmd ? `Set ${cardName} as commander` : `Unset ${cardName} as commander`, versionSince)
    toast.success(becameCmd ? 'Set as commander!' : 'Removed as commander')
  }

  const setAsCoverImage = async (scryfallId: string) => {
    const versionSince = new Date().toISOString()
    if (coverImageId === scryfallId) {
      const previousId = coverImageId
      const previousUrl = coverImageUrl
      setCoverImageId(null)
      setCoverImageUrl(null)
      const { error } = await supabase.from('decks').update({ cover_image_scryfall_id: null }).eq('id', deckId)
      if (error) {
        setCoverImageId(previousId)
        setCoverImageUrl(previousUrl)
        toast.error(error.message)
        return
      }
      recordMutationVersion('Removed cover image', versionSince)
      toast.success('Cover image removed')
    } else {
      const previousId = coverImageId
      const previousUrl = coverImageUrl
      const deckCard = cards.find(c => c.scryfall_id === scryfallId)
      let nextUrl = deckCard?.image_url ?? null
      if (!nextUrl) {
        const fetched = await getCard(scryfallId)
        nextUrl = getCardImageUrl(fetched) ?? null
      }
      setCoverImageId(scryfallId)
      setCoverImageUrl(nextUrl)
      const { error } = await supabase.from('decks').update({ cover_image_scryfall_id: scryfallId }).eq('id', deckId)
      if (error) {
        setCoverImageId(previousId)
        setCoverImageUrl(previousUrl)
        toast.error(error.message)
        return
      }
      const card = cards.find(c => c.scryfall_id === scryfallId)
      recordMutationVersion(`Set cover image to ${card?.name ?? 'card'}`, versionSince)
      toast.success('Set as cover image!')
    }
  }

  const addTag = async (cardId: string, tag: string) => {
    const stored = normalizeTagForStorage(tag)
    if (!stored) return
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const currentTags = card.tags || []
    if (currentTags.some(t => t.toLowerCase() === stored.toLowerCase())) return
    const newTags = [...currentTags, stored]
    const versionSince = new Date().toISOString()
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    const { error } = await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: currentTags } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Tagged ${card.name} with "${stored}"`, versionSince)
    }
  }

  const removeTag = async (cardId: string, tag: string) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const currentTags = card.tags || []
    const newTags = currentTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
    const versionSince = new Date().toISOString()
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    const { error } = await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: currentTags } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Untagged ${card.name} from "${tag}"`, versionSince)
    }
  }

  const setCardPrinting = async (cardId: string, printingId: string | null) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const versionSince = new Date().toISOString()
    const nextPrinting = printingId ? printingsByCard[cardId]?.find(p => p.id === printingId) : null
    const defaultPrinting = !printingId ? printingsByCard[cardId]?.find(p => p.id === card.scryfall_id) : null
    const nextCard = nextPrinting ? {
      ...card,
      printing_scryfall_id: printingId,
      image_url: getCardImageUrl(nextPrinting),
      face_images: getCardFaceImages(nextPrinting),
      set_code: nextPrinting.set,
      collector_number: nextPrinting.collector_number,
      available_finishes: nextPrinting.finishes,
      price_usd: pickPrice(nextPrinting.prices, card.finish),
      rarity: nextPrinting.rarity,
      effective_printing_id: nextPrinting.id,
    } : defaultPrinting ? {
      ...card,
      printing_scryfall_id: null,
      image_url: getCardImageUrl(defaultPrinting),
      face_images: getCardFaceImages(defaultPrinting),
      set_code: defaultPrinting.set,
      collector_number: defaultPrinting.collector_number,
      available_finishes: defaultPrinting.finishes,
      price_usd: pickPrice(defaultPrinting.prices, card.finish),
      rarity: defaultPrinting.rarity,
      effective_printing_id: card.scryfall_id,
    } : {
      ...card,
      printing_scryfall_id: null,
      effective_printing_id: card.scryfall_id,
    }
    setCards(prev => prev.map(c => c.id === cardId ? nextCard : c))
    const { error } = await supabase.from('deck_cards').update({ printing_scryfall_id: printingId }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? card : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(printingId ? `Changed ${card.name} printing` : `Reset ${card.name} to default printing`, versionSince)
    }
  }

  const setCardFinish = async (cardId: string, finish: 'nonfoil' | 'foil' | 'etched') => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const versionSince = new Date().toISOString()
    const currentPrinting = printingsByCard[cardId]?.find(p => p.id === (card.printing_scryfall_id || card.scryfall_id))
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, finish, price_usd: pickPrice(currentPrinting?.prices, finish) ?? c.price_usd } : c))
    const { error } = await supabase.from('deck_cards').update({ finish }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, finish: card.finish } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Changed ${card.name} finish to ${finish}`, versionSince)
    }
  }

  const ensurePrintingsLoaded = async (card: DeckCard) => {
    if (printingsByCard[card.id]) return
    if (!card.oracle_id) return
    const prints = await getPrintingsByOracleId(card.oracle_id)
    setPrintingsByCard(prev => ({ ...prev, [card.id]: prints }))
  }

  const moveCardToZone = async (cardId: string, zone: string) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    if ((card.zone ?? 'mainboard') === zone) return
    const versionSince = new Date().toISOString()
    const prevZone = card.zone ?? 'mainboard'
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, zone } : c))
    const { error } = await supabase.from('deck_cards').update({ zone }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, zone: prevZone } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Moved ${card.name} to ${zone}`, versionSince)
    }
  }

  /** Batch-move all cards in `fromZone` to `toZone` in a single DB update. */
  const moveAllCardsInZone = async (fromZone: string, toZone: string) => {
    const zoneCards = cards.filter(c => (c.zone ?? 'mainboard') === fromZone)
    if (zoneCards.length === 0) return
    const versionSince = new Date().toISOString()
    const cardIds = zoneCards.map(c => c.id)
    // Optimistic update
    setCards(prev => prev.map(c => cardIds.includes(c.id) ? { ...c, zone: toZone } : c))
    const { error } = await supabase
      .from('deck_cards')
      .update({ zone: toZone })
      .in('id', cardIds)
    if (error) {
      // Revert
      setCards(prev => prev.map(c => cardIds.includes(c.id) ? { ...c, zone: fromZone } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Moved all cards from ${fromZone} to ${toZone}`, versionSince)
    }
  }

  const handleCustomTagSubmit = () => {
    if (activeCardIdForTag && customTagInput) addTag(activeCardIdForTag, customTagInput)
    setTagDialogOpen(false)
    setCustomTagInput("")
    setActiveCardIdForTag(null)
  }

  const handleCustomBoardSubmit = () => {
    const error = validateCustomZoneName(customBoardInput)
    if (error === "empty") {
      setCustomBoardError("Board name cannot be empty.")
      return
    }
    if (error === "reserved") {
      setCustomBoardError(`"${customBoardInput.trim()}" is a reserved board name. Please choose a different name.`)
      return
    }
    const zoneId = sanitizeCustomZoneId(customBoardInput)
    if (!zoneId) {
      setCustomBoardError("Board name is invalid.")
      return
    }
    if (activeCardIdForBoard) {
      void moveCardToZone(activeCardIdForBoard, zoneId)
    }
    setBoardDialogOpen(false)
    setCustomBoardInput("")
    setCustomBoardError(null)
    setActiveCardIdForBoard(null)
  }

  const handleTagDragEnd = (event: DragEndEvent) => {
    const cardId = parseDeckCardDragId(String(event.active.id), grouping)
    const tag = event.over?.id ? String(event.over.id) : null
    if (tag && grouping === 'tag' && tag !== TAG_GROUP_UNTAGGED) {
      void addTag(cardId, tag)
    }
  }

  const allUniqueTags = useMemo(() => {
    const lowerToCanonical = new Map<string, string>()
    const add = (raw: string) => {
      const k = raw.trim().toLowerCase()
      if (!k) return
      if (!lowerToCanonical.has(k)) lowerToCanonical.set(k, normalizeTagForStorage(raw))
    }
    for (const t of DEFAULT_TAGS) add(t)
    for (const c of cards) {
      for (const t of c.tags || []) add(t)
    }
    return [...lowerToCanonical.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([, display]) => display)
  }, [cards])

  const enterVersionView = async (versionId: string) => {
    const row: DeckVersionRow | null = await getVersion(versionId)
    if (!row) {
      toast.error('Version not found')
      return
    }

    const snap = await hydrateVersionSnapshot(deckId, row)
    setDeckTitleEditing(false)
    setViewing(snap)
  }

  const openDiffWithVersion = async (versionId: string, label: string) => {
    const row = await getVersion(versionId)
    if (!row) {
      toast.error('Version not found')
      return
    }
    const hydrated = await hydrateVersionSnapshot(deckId, row)
    setDiffTarget({ label: label || hydrated.label, cards: hydrated.cards })
    setDiffOpen(true)
  }

  const openViewingDiffWithLatest = () => {
    if (!viewing) return
    setDiffTarget({ label: viewing.label, cards: viewing.cards })
    setDiffOpen(true)
  }

  const exitVersionView = () => {
    setDiffOpen(false)
    setDiffTarget(null)
    setViewing(null)
  }

  const handleRevertFromBanner = async () => {
    if (!viewing) return
    setReverting(true)
    const ok = await revertToVersion(deckId, viewing.versionId)
    setReverting(false)
    if (!ok) {
      toast.error('Revert failed')
      return
    }
    toast.success('Reverted')
    setRevertConfirmOpen(false)
    setViewing(null)
    await fetchDeck()
  }

  const savePrimer = async (markdown: string) => {
    const versionSince = new Date().toISOString()
    const { error } = await supabase.from('decks').update({ primer_markdown: markdown }).eq('id', deckId)
    if (error) {
      toast.error(error.message)
      return
    }
    setPrimerMarkdown(markdown)
    setPrimerEditing(false)
    recordMutationVersion('Updated primer', versionSince)
    toast.success('Primer saved')
  }

  // Cards displayed in the workspace: live state by default, snapshot when viewing a version.
  // Declared before getGroupedCards/totalUsd because both reference it.
  const displayedCards = viewing ? viewing.cards : cards
  const displayedCommanderIds = viewing ? viewing.deckMeta.commanders : commanderIds
  const displayedCoverImageId = viewing ? viewing.deckMeta.cover_image_scryfall_id : coverImageId
  const displayedCoverImageUrl = viewing ? viewing.coverImageUrl : coverImageUrl
  const displayedDeckName = viewing
    ? viewing.deckMeta.name
    : (deck?.name ?? initialDeckName ?? "Loading…")
  const displayedFormat = viewing ? viewing.deckMeta.format : deck?.format ?? null
  const displayedBracket = viewing ? viewing.deckMeta.bracket : deck?.bracket ?? null

  // Custom zone ids: any zone value not in the registry (user-created boards)
  const customZoneIds = useMemo(
    () => Array.from(new Set(displayedCards.map(c => c.zone ?? 'mainboard').filter(z => !REGISTRY_ZONE_IDS.has(z)))),
    [displayedCards]
  )

  // Cards filtered to the active zone (for the decklist view)
  const zoneFilteredCards = useMemo(
    () => displayedCards.filter(c => (c.zone ?? 'mainboard') === activeZone),
    [displayedCards, activeZone]
  )

  const cardInteractionKey = useMemo(
    () => displayedCards.map(c => `${c.id}:${c.effective_printing_id ?? c.scryfall_id}:${c.quantity}`).join('|'),
    [displayedCards]
  )
  const cardInteractionPhase: CardInteractionPhase = cardsLoading
    ? 'loading'
    : readyCardInteractionKey === cardInteractionKey
      ? 'ready'
      : 'settling'

  const totalUsd = useMemo(() => {
    let sum = 0
    let anyMissing = false
    for (const c of displayedCards) {
      if (c.price_usd == null) { anyMissing = true; continue }
      sum += c.price_usd * c.quantity
    }
    return { sum, anyMissing }
  }, [displayedCards])

  const deckLandQtyIncludingMdfc = useMemo(
    () =>
      zoneFilteredCards.reduce(
        (sum, c) => sum + (hasLandFaceOnTypeLine(c.type_line) ? c.quantity : 0),
        0
      ),
    [zoneFilteredCards]
  )

  const formatValidation = useMemo(
    () =>
      validateDeckForFormat(displayedFormat, {
        cards: displayedCards,
        commanderScryfallIds: displayedCommanderIds,
        bracket: displayedBracket,
        dataVersion: getFormatValidationDataVersion(displayedFormat),
      }),
    [displayedCards, displayedCommanderIds, displayedFormat, displayedBracket]
  )
  const formatViolationMap = formatValidation.violationsByCardId

  const formatHintCardList = useMemo(
    () =>
      displayedCards
        .filter((c) => (formatViolationMap.get(c.id)?.length ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [displayedCards, formatViolationMap]
  )

  const groupedCards = useMemo(
    () => groupDeckCards(zoneFilteredCards, grouping, sorting),
    [zoneFilteredCards, grouping, sorting]
  )

  const commanderCards = displayedCommanderIds
    .map(id => displayedCards.find(c => c.scryfall_id === id))
    .filter((c): c is DeckCard => Boolean(c))
  const stackPeek = Math.round(cardSize * STACK_PEEK_RATIO)
  const stackExtraPeek = Math.round(cardSize * STACK_EXTRA_PEEK_RATIO)
  const stackCardHeight = Math.round(cardSize * STACK_CARD_HEIGHT_RATIO)
  const stackHoverShift = Math.round(cardSize * STACK_HOVER_SHIFT_RATIO)

  useEffect(() => {
    if (cardsLoading) return

    let settleTimer: ReturnType<typeof setTimeout> | null = null
    const paintFrame = requestAnimationFrame(() => {
      settleTimer = setTimeout(() => setReadyCardInteractionKey(cardInteractionKey), CARD_INTERACTION_SETTLE_MS)
    })

    return () => {
      cancelAnimationFrame(paintFrame)
      if (settleTimer) clearTimeout(settleTimer)
    }
  }, [cardsLoading, cardInteractionKey, grouping, sorting, viewMode])

  const showClickedPreview = (card: DeckCard, groupName: string) => {
    if (performance.now() - formatHintsMenuClosedAtRef.current < 450) return
    setPreviewFaceIndex(0)
    setPreviewFormatHintsHovered(false)
    setClickedPreview({ card, groupName })
    void ensurePrintingsLoaded(card)
  }

  const overflowMenus: DeckWorkspaceOverflowMenusProps = {
    isOwner,
    viewing: !!viewing,
    grouping,
    commanderIds,
    coverImageId,
    allUniqueTags,
    printingsByCard,
    formatHintsMenuClosedAtRef,
    displayedFormat,
    customZoneIds,
    ensurePrintingsLoaded,
    onSetCommander: (id) => {
      void setAsCommander(id)
    },
    onSetCoverImage: (id) => {
      void setAsCoverImage(id)
    },
    onSetCardPrinting: (cardId, printingId) => {
      void setCardPrinting(cardId, printingId)
    },
    onSetCardFinish: (cardId, finish) => {
      void setCardFinish(cardId, finish)
    },
    onAddTag: (cardId, tag) => {
      void addTag(cardId, tag)
    },
    onRemoveTag: (cardId, tag) => {
      void removeTag(cardId, tag)
    },
    onOpenCustomTagDialog: (cardId) => {
      setActiveCardIdForTag(cardId)
      setTagDialogOpen(true)
    },
    onMoveToZone: (cardId, zone) => {
      void moveCardToZone(cardId, zone)
    },
    onOpenCustomBoardDialog: (cardId) => {
      setActiveCardIdForBoard(cardId)
      setCustomBoardInput("")
      setCustomBoardError(null)
      setBoardDialogOpen(true)
    },
    onDeleteCard: (id) => {
      void deleteCard(id)
    },
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
  const cardDragDisabled = interactionsLocked || cardInteractionPhase !== 'ready' || grouping !== 'tag'
  const clickedPreviewCard = clickedPreview
    ? displayedCards.find(card => card.id === clickedPreview.card.id) ?? clickedPreview.card
    : null

  return (
    <div
      className={`fixed inset-x-0 bottom-0 flex flex-col overflow-hidden bg-background font-sans text-foreground transition-[top] duration-200 ease-out ${
        deckEditorScrollCompact ? "top-7" : "top-14"
      }`}
    >

      <DeckWorkspaceHeader
        deckId={deckId}
        deck={deck}
        isOwner={isOwner}
        viewing={!!viewing}
        tab={tab}
        interactionsLocked={interactionsLocked}
        displayedCoverImageUrl={displayedCoverImageUrl}
        displayedDeckName={displayedDeckName}
        displayedCards={displayedCards}
        displayedCommanderIds={displayedCommanderIds}
        exportPrimerMarkdown={viewing ? viewing.primerMarkdown : primerMarkdown}
        totalUsd={totalUsd}
        deckTitleEditing={deckTitleEditing}
        deckTitleDraft={deckTitleDraft}
        deckTitleSaving={deckTitleSaving}
        deckTitleFieldRef={deckTitleFieldRef}
        query={query}
        searchFocused={searchFocused}
        results={results}
        selectedResultIdx={selectedResultIdx}
        searchContainerRef={searchContainerRef}
        onBack={() => router.push(isOwner ? "/decks" : "/")}
        onDeckTitleDraftChange={setDeckTitleDraft}
        onDeckTitleInputBlur={() => {
          if (skipDeckTitleBlurCommitRef.current) {
            skipDeckTitleBlurCommitRef.current = false
            return
          }
          void commitDeckTitleEdit()
        }}
        onDeckTitleInputKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            skipDeckTitleBlurCommitRef.current = true
            setDeckTitleDraft(deck?.name ?? "")
            setDeckTitleEditing(false)
          } else if (e.key === "Enter") {
            e.preventDefault()
            deckTitleFieldRef.current?.querySelector("input")?.blur()
          }
        }}
        onDeckTitleDisplayDoubleClick={(e) => {
          e.preventDefault()
          if (!isOwner || viewing || !deck) return
          skipDeckTitleBlurCommitRef.current = false
          setDeckTitleDraft(deck.name ?? "")
          setDeckTitleEditing(true)
        }}
        onQueryChange={setQuery}
        onSearchFocus={() => setSearchFocused(true)}
        onSearchKeyDown={handleSearchKeyDown}
        onSearchResultHover={setSelectedResultIdx}
        onSearchResultRulesHover={onSearchResultRulesHover}
        onAddCard={handleAddCard}
        onOpenSettings={() => setSettingsOpen(true)}
        onImportClick={() => setImportOpen(true)}
        onVisibilityChange={(pub) => deck && setDeck({ ...deck, is_public: pub })}
        collapsedChrome={deckChromeCollapsed}
      />

      <DeckTabs
        tab={tab}
        onChange={setTab}
        afterTabs={viewing && (
          <ViewingVersionBanner
            versionLabel={viewing.label}
            isOwner={isOwner}
            onCompareLatest={openViewingDiffWithLatest}
            onRevert={() => setRevertConfirmOpen(true)}
            onBackToLatest={exitVersionView}
          />
        )}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-background/20 min-w-0">
          <div className="p-6 max-w-7xl mx-auto space-y-8">
        {tab === "decklist" && (
          <>
            <div className="relative z-20 overflow-visible">
              <div className="flex flex-col gap-4 min-[1180px]:flex-row min-[1180px]:items-start min-[1180px]:justify-between min-[1180px]:gap-6 min-[1180px]:-mb-12 min-[1180px]:pb-3">
                <div className="min-w-0 min-[1180px]:flex-1">
                  <DeckWorkspaceDecklistToolbar
                    cardSize={cardSize}
                    grouping={grouping}
                    sorting={sorting}
                    viewMode={viewMode}
                    displayedFormat={displayedFormat}
                    formatValidationStatus={formatValidation.status}
                    formatDeckViolations={formatValidation.deckViolations}
                    formatViolationCount={formatViolationMap.size}
                    activeZone={activeZone}
                    customZoneIds={customZoneIds}
                    onCardSizeChange={(n) => {
                      setCardSize(n)
                      saveDeckWorkspaceDisplayPrefs({ viewMode, grouping, sorting, cardSize: n })
                    }}
                    onGroupingChange={(g) => {
                      setGrouping(g)
                      saveDeckWorkspaceDisplayPrefs({ viewMode, grouping: g, sorting, cardSize })
                    }}
                    onSortingChange={(s) => {
                      setSorting(s)
                      saveDeckWorkspaceDisplayPrefs({ viewMode, grouping, sorting: s, cardSize })
                    }}
                    onViewModeChange={(v) => {
                      setViewMode(v)
                      saveDeckWorkspaceDisplayPrefs({ viewMode: v, grouping, sorting, cardSize })
                    }}
                    onOpenFormatHints={() => setFormatHintsListOpen(true)}
                    onZoneChange={setActiveZone}
                  />
                </div>
                <DeckWorkspaceCommanderRail
                  commanderCards={commanderCards}
                  showClickedPreview={showClickedPreview}
                  onDeckCardRulesPreviewHover={onDeckCardRulesPreviewHover}
                />
              </div>
            </div>
            <DeckWorkspaceGroupedDecklist
              groupedCards={groupedCards}
              grouping={grouping}
              viewMode={viewMode}
              cardSize={cardSize}
              collapsedSections={collapsedSections}
              toggleSection={toggleSection}
              toggleAllSections={toggleAllSections}
              cardDragDisabled={cardDragDisabled}
              deckLandQtyIncludingMdfc={deckLandQtyIncludingMdfc}
              displayedCards={zoneFilteredCards}
              displayedCommanderIds={displayedCommanderIds}
              displayedCoverImageId={displayedCoverImageId}
              formatViolationMap={formatViolationMap}
              deckFormatHintHoverId={deckFormatHintHoverId}
              setDeckFormatHintHoverId={setDeckFormatHintHoverId}
              hoveredStack={hoveredStack}
              setHoveredStack={setHoveredStack}
              ensurePrintingsLoaded={ensurePrintingsLoaded}
              showClickedPreview={showClickedPreview}
              stackPeek={stackPeek}
              stackExtraPeek={stackExtraPeek}
              stackCardHeight={stackCardHeight}
              stackHoverShift={stackHoverShift}
              cardsLoading={cardsLoading}
              liveCardCount={zoneFilteredCards.length}
              sensors={dndSensors}
              onTagDragEnd={handleTagDragEnd}
              overflowMenus={overflowMenus}
              rulesHover={rulesHover}
              onDeckCardRulesPreviewHover={onDeckCardRulesPreviewHover}
              dockRightInsetPx={dockRightInsetPx}
            />
          </>
        )}

        {tab === "boards" && (
          <DeckWorkspaceBoardsTab
            cards={displayedCards}
            format={displayedFormat}
            isOwner={isOwner}
            viewing={!!viewing}
            activeZone={activeZone}
            onZoneChange={(zone) => {
              setActiveZone(zone)
              setTab("decklist")
            }}
            onMoveCardToZone={(cardId, zone) => void moveCardToZone(cardId, zone)}
            onRemoveBoard={(zoneId) => {
              void moveAllCardsInZone(zoneId, 'mainboard').then(() => {
                toast.success(`Moved all cards from board to mainboard.`)
              })
            }}
          />
        )}


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
            onDiffWithVersion={(id, label) => { void openDiffWithVersion(id, label) }}
            onReverted={() => { setViewing(null); void fetchDeck() }}
          />
        )}
          </div>
        </div>

      {isOwner && !viewing && (
        <DeckAgentSidebar
          deckId={deckId}
          open={agentOpen}
          onClose={() => setAgentOpen(false)}
          onOpen={() => setAgentOpen(true)}
          onAssistantResponseFinished={fetchDeck}
          onRailInsetChange={setAgentRailInsetPx}
        />
      )}
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
            budget_usd: deck.budget_usd ?? null,
            bracket: deck.bracket ?? null,
            is_public: !!deck.is_public,
          }}
          onSaved={(next) => setDeck({ ...deck, ...next })}
        />
      )}


      {isOwner && (
        <ImportDecklistDialog
          deckId={deckId}
          currentCards={cards}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => void fetchDeck()}
        />
      )}

      <DeckWorkspaceDialogsSection
        grouping={grouping}
        displayedFormat={displayedFormat}
        formatHintsListOpen={formatHintsListOpen}
        setFormatHintsListOpen={setFormatHintsListOpen}
        formatHintCardList={formatHintCardList}
        formatViolationMap={formatViolationMap}
        formatHintsMenuClosedAtRef={formatHintsMenuClosedAtRef}
        showClickedPreview={showClickedPreview}
        overflowMenus={overflowMenus}
        diffOpen={diffOpen}
        setDiffOpen={setDiffOpen}
        diffTarget={diffTarget}
        setDiffTarget={setDiffTarget}
        cards={cards}
        clickedPreview={clickedPreview}
        setClickedPreview={setClickedPreview}
        clickedPreviewCard={clickedPreviewCard}
        previewFaceIndex={previewFaceIndex}
        setPreviewFaceIndex={setPreviewFaceIndex}
        previewFormatHintsHovered={previewFormatHintsHovered}
        setPreviewFormatHintsHovered={setPreviewFormatHintsHovered}
        revertConfirmOpen={revertConfirmOpen}
        setRevertConfirmOpen={setRevertConfirmOpen}
        reverting={reverting}
        handleRevertFromBanner={handleRevertFromBanner}
        tagDialogOpen={tagDialogOpen}
        setTagDialogOpen={setTagDialogOpen}
        customTagInput={customTagInput}
        setCustomTagInput={setCustomTagInput}
        handleCustomTagSubmit={handleCustomTagSubmit}
        boardDialogOpen={boardDialogOpen}
        setBoardDialogOpen={setBoardDialogOpen}
        customBoardInput={customBoardInput}
        setCustomBoardInput={setCustomBoardInput}
        customBoardError={customBoardError}
        handleCustomBoardSubmit={handleCustomBoardSubmit}
      />
    </div>
  )
}
