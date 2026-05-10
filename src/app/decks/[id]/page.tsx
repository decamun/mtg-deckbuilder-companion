"use client"

import { useState, useEffect, useLayoutEffect, use, useRef, useMemo, useCallback, type CSSProperties, type ReactNode } from "react"
import { motion } from "framer-motion"
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Search, LayoutGrid, List, Layers as StackIcon, Crown, Image as ImageIcon, MoreVertical, Settings, Edit as EditIcon, Loader2, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCardsByIds, getCard, getPrintingsByOracleId, cmcOf, getCardFaceImages, getCardImageUrl, type ScryfallCard, type ScryfallPrinting } from "@/lib/scryfall"
import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { DeckAgentSidebar } from "@/components/agent/DeckAgentSidebar"
import { DeckAnalytics } from "@/components/deck-analytics"
import { DeckSettingsDialog } from "@/components/deck/DeckSettingsDialog"
import { ImportDecklistDialog } from "@/components/deck/ImportDecklistDialog"
import { DeckTabs, type DeckTab } from "@/components/deck/DeckTabs"
import { DeckDiffView } from "@/components/deck/DeckDiffView"
import { ExportDeckMenu } from "@/components/deck/ExportDeckMenu"
import { DeckLikeButton } from "@/components/deck/DeckLikeButton"
import { PrimerView } from "@/components/primer/PrimerView"
import { PrimerEditor } from "@/components/primer/PrimerEditor"
import { VersionsTab } from "@/components/versions/VersionsTab"
import { ViewingVersionBanner } from "@/components/versions/ViewingVersionBanner"
import { getVersion, recordVersion, revertToVersion, flushPendingVersion, type DeckVersionRow } from "@/lib/versions"
import { formatPrice, pickPrice } from "@/lib/format"
import { ManaText } from "@/components/mana/ManaText"
import { getCardTypeGroup } from "@/lib/card-types"
import { isFormatValidationImplemented, validateDeckForFormat } from "@/lib/deck-format-validation"

type DeckCardRow = Omit<DeckCard, "image_url" | "face_images" | "type_line" | "mana_cost" | "cmc" | "colors" | "set_code" | "collector_number" | "available_finishes" | "price_usd" | "effective_printing_id">

type ViewingSnapshotState = {
  versionId: string
  label: string
  cards: DeckCard[]
  deckMeta: {
    name: string
    description: string | null
    format: string | null
    bracket: number | null
    commanders: string[]
    cover_image_scryfall_id: string | null
    is_public: boolean
  }
  primerMarkdown: string
  coverImageUrl: string | null
}

type CardInteractionPhase = 'loading' | 'settling' | 'ready'

type DiffTargetState = {
  label: string
  cards: DeckCard[]
}

// Stack card width is w-44 (176px); height ≈ 176 * 1.4 = 246px
const DEFAULT_CARD_SIZE = 176
const MIN_CARD_SIZE = 132
const MAX_CARD_SIZE = 240
const STACK_PEEK_RATIO = 32 / DEFAULT_CARD_SIZE
const STACK_EXTRA_PEEK_RATIO = 14 / DEFAULT_CARD_SIZE
const STACK_CARD_HEIGHT_RATIO = 246 / DEFAULT_CARD_SIZE
const STACK_HOVER_SHIFT_RATIO = 44 / DEFAULT_CARD_SIZE
const CARD_INTERACTION_SETTLE_MS = 250

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

function visualDeckCardChrome(
  card: DeckCard,
  opts: {
    commanderIds: readonly string[]
    coverImageId: string | null
    violations: readonly string[] | undefined
  }
): string {
  if (opts.violations && opts.violations.length > 0) {
    return 'border-red-500/85 ring-2 ring-red-500/45 hover:border-red-400'
  }
  if (opts.commanderIds.includes(card.scryfall_id)) {
    return 'border-yellow-400/80 ring-2 ring-yellow-400/40 hover:border-yellow-300'
  }
  if (opts.coverImageId === card.scryfall_id) {
    return 'border-blue-400/80 ring-2 ring-blue-400/40 hover:border-blue-300'
  }
  return 'border-border hover:border-primary/50'
}

/** Tag view lists the same deck row in multiple sections; @dnd-kit requires a unique id per draggable node. */
function deckCardDragId(grouping: GroupingMode, groupName: string, cardId: string): string {
  if (grouping === "tag") {
    return JSON.stringify({ __tagSlot: true as const, group: groupName, cardId })
  }
  return cardId
}

function parseDeckCardDragId(rawId: string, grouping: GroupingMode): string {
  if (grouping !== "tag") return rawId
  try {
    const parsed = JSON.parse(rawId) as { __tagSlot?: boolean; cardId?: string }
    if (parsed?.__tagSlot && typeof parsed.cardId === "string") return parsed.cardId
  } catch {
    /* legacy plain uuid */
  }
  return rawId
}

function DraggableDeckCard({
  id,
  disabled,
  className,
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
  title,
  children,
}: {
  id: string
  disabled: boolean
  className?: string
  style?: CSSProperties
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement>) => void
  title?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled })
  const dragStyle: CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : style?.opacity,
    zIndex: isDragging ? 1000 : style?.zIndex,
  }

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={dragStyle}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      {children}
    </div>
  )
}

function mergeDeckCardRow(current: DeckCard, row: DeckCardRow): DeckCard {
  return {
    ...current,
    ...row,
    image_url: current.image_url,
    face_images: current.face_images,
    type_line: current.type_line,
    mana_cost: current.mana_cost,
    oracle_text: current.oracle_text,
    cmc: current.cmc,
    colors: current.colors,
    color_identity: current.color_identity,
    legalities: current.legalities,
    produced_mana: current.produced_mana,
    set_code: current.set_code,
    collector_number: current.collector_number,
    available_finishes: current.available_finishes,
    price_usd: current.price_usd,
    effective_printing_id: current.effective_printing_id,
  }
}

function DroppableTagGroup({
  id,
  enabled,
  children,
}: {
  id: string
  enabled: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled })

  return (
    <div ref={setNodeRef} className={isOver && enabled ? "rounded-lg ring-2 ring-primary/40 ring-offset-4 ring-offset-background" : undefined}>
      {children}
    </div>
  )
}

function primaryDeckCardImage(card: DeckCard): string | undefined {
  return card.face_images?.[0]?.normal ?? card.face_images?.[0]?.small ?? card.image_url
}

function CardThumbnail({
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
      <div className={`${className ?? ""} flex aspect-[5/7] items-center justify-center rounded-xl border border-border/40 bg-card/50`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    )
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <img src={imageUrl} alt={card.name} className={imageClassName} draggable={false} />
      {(card.finish === 'foil' || card.finish === 'etched') && (
        <div className={`absolute inset-0 pointer-events-none foil-overlay ${overlayClassName}`} />
      )}
    </div>
  )
}

function CardArt({
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
  const faces = card.face_images?.length ? card.face_images : card.image_url ? [{ name: card.name, normal: card.image_url }] : []
  const activeFace = faces[faceIndex] ?? faces[0]
  const activeImage = activeFace?.normal ?? activeFace?.small
  const canFlip = faces.length > 1

  return (
    <div className={`relative ${className ?? ""}`}>
      {activeImage ? (
        <>
          <img src={activeImage} alt={activeFace.name} className={imageClassName} draggable={false} />
          {(card.finish === 'foil' || card.finish === 'etched') && (
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
  const [sorting] = useState<SortingMode>('name')
  const debouncedQuery = useDebounce(query, 300)

  const [commanderIds, setCommanderIds] = useState<string[]>([])
  const [coverImageId, setCoverImageId] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)

  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState("")
  const [activeCardIdForTag, setActiveCardIdForTag] = useState<string | null>(null)

  const [hoveredStack, setHoveredStack] = useState<{ groupName: string; colIdx: number; itemIdx: number } | null>(null)
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
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
    const url = new URL(window.location.href)
    if (t === "decklist") url.searchParams.delete("tab")
    else url.searchParams.set("tab", t)
    router.replace(`${url.pathname}${url.search}`)
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(true)
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

  const [deckTitleEditing, setDeckTitleEditing] = useState(false)
  const [deckTitleDraft, setDeckTitleDraft] = useState("")
  const [deckTitleSaving, setDeckTitleSaving] = useState(false)
  const deckTitleFieldRef = useRef<HTMLDivElement>(null)
  const skipDeckTitleBlurCommitRef = useRef(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  const fetchGenRef = useRef(0)
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
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!clickedPreview) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClickedPreview(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clickedPreview])

  const fetchDeck = useCallback(async () => {
    const gen = ++fetchGenRef.current

    const { data: { user: viewer } } = await supabase.auth.getUser()
    const viewerId = viewer?.id ?? null

    const { data: deckData, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .maybeSingle()

    if (deckError || !deckData) {
      setAccessDenied(true)
      return
    }
    if (gen !== fetchGenRef.current) return
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
      if (gen !== fetchGenRef.current) return
      const sfMap = new Map(sfCards.map(c => [c.id, c]))

      const hydrated: DeckCard[] = cardsData.map(c => {
        const baseSf = sfMap.get(c.scryfall_id)
        const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
        const effectiveId = c.printing_scryfall_id || c.scryfall_id
        const effSf = sfMap.get(effectiveId) ?? baseSf
        const finish = (c.finish ?? 'nonfoil') as 'nonfoil' | 'foil' | 'etched'
        const faceImages = getCardFaceImages(effSf)
        return {
          ...c,
          oracle_id: oracleId,
          finish,
          printing_scryfall_id: c.printing_scryfall_id ?? null,
          image_url: getCardImageUrl(effSf),
          face_images: faceImages,
          type_line: effSf?.type_line || '',
          mana_cost: effSf?.mana_cost || '',
          cmc: cmcOf(effSf),
          colors: effSf?.colors ?? [],
          color_identity: effSf?.color_identity ?? [],
          legalities: effSf?.legalities,
          oracle_text: effSf?.oracle_text || '',
          produced_mana: effSf?.produced_mana ?? [],
          set_code: effSf?.set,
          collector_number: effSf?.collector_number,
          available_finishes: effSf?.finishes,
          price_usd: pickPrice(effSf?.prices, finish),
          effective_printing_id: effectiveId,
        }
      })

      setCards(hydrated)
      setCardsLoading(false)

      // Cover image URL
      const coverId = deckData.cover_image_scryfall_id || null
      if (coverId) {
        const inDeck = sfMap.get(coverId)
        const inDeckCoverUrl = getCardImageUrl(inDeck)
        if (inDeckCoverUrl) setCoverImageUrl(inDeckCoverUrl)
        else {
          const fetched = await getCard(coverId)
          if (gen === fetchGenRef.current) setCoverImageUrl(getCardImageUrl(fetched) ?? null)
        }
      } else {
        setCoverImageUrl(null)
      }
    }
  }, [deckId])

  useEffect(() => {
    void Promise.resolve().then(() => void fetchDeck())
    const channel = supabase
      .channel(`deck-workspace:${deckId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decks', filter: `id=eq.${deckId}` }, () => {
        void fetchDeck()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deck_cards', filter: `deck_id=eq.${deckId}` }, () => {
        void fetchDeck()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [deckId, fetchDeck])

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
        oracle_text: card.oracle_text || '',
        set_code: card.set,
        collector_number: card.collector_number,
        available_finishes: card.finishes,
        price_usd: pickPrice(card.prices, 'nonfoil'),
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
    if (!tag.trim()) return
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const currentTags = card.tags || []
    if (currentTags.includes(tag)) return
    const newTags = [...currentTags, tag]
    const versionSince = new Date().toISOString()
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    const { error } = await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
    if (error) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: currentTags } : c))
      toast.error(error.message)
    } else {
      recordMutationVersion(`Tagged ${card.name} with "${tag}"`, versionSince)
    }
  }

  const removeTag = async (cardId: string, tag: string) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const currentTags = card.tags || []
    const newTags = currentTags.filter(t => t !== tag)
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

  const handleCustomTagSubmit = () => {
    if (activeCardIdForTag && customTagInput) addTag(activeCardIdForTag, customTagInput)
    setTagDialogOpen(false)
    setCustomTagInput("")
    setActiveCardIdForTag(null)
  }

  const handleTagDragEnd = (event: DragEndEvent) => {
    const cardId = parseDeckCardDragId(String(event.active.id), grouping)
    const tag = event.over?.id ? String(event.over.id) : null
    if (tag && grouping === 'tag' && tag !== 'Untagged') {
      void addTag(cardId, tag)
    }
  }

  const allUniqueTags = Array.from(new Set([...DEFAULT_TAGS, ...cards.flatMap(c => c.tags || [])])).sort()

  const hydrateVersionSnapshot = async (row: DeckVersionRow): Promise<ViewingSnapshotState> => {
    const snap = row.snapshot
    const ids = new Set<string>()
    for (const c of snap.cards) ids.add(c.printing_scryfall_id || c.scryfall_id)
    if (snap.deck.cover_image_scryfall_id) ids.add(snap.deck.cover_image_scryfall_id)

    const sfCards = await getCardsByIds(Array.from(ids))
    const sfMap = new Map(sfCards.map(c => [c.id, c]))

    const hydrated: DeckCard[] = snap.cards.map((c, i) => {
      const baseSf = sfMap.get(c.scryfall_id)
      const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
      const effectiveId = c.printing_scryfall_id || c.scryfall_id
      const effSf = sfMap.get(effectiveId) ?? baseSf
      const faceImages = getCardFaceImages(effSf)
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
        image_url: getCardImageUrl(effSf),
        face_images: faceImages,
        type_line: effSf?.type_line || '',
        mana_cost: effSf?.mana_cost || '',
        cmc: cmcOf(effSf),
        colors: effSf?.colors ?? [],
        color_identity: effSf?.color_identity ?? [],
        legalities: effSf?.legalities,
        oracle_text: effSf?.oracle_text || '',
        produced_mana: effSf?.produced_mana ?? [],
        set_code: effSf?.set,
        collector_number: effSf?.collector_number,
        available_finishes: effSf?.finishes,
        price_usd: pickPrice(effSf?.prices, c.finish),
        effective_printing_id: effectiveId,
      }
    })

    const coverId = snap.deck.cover_image_scryfall_id
    const coverImageUrlSnap = coverId ? (getCardImageUrl(sfMap.get(coverId)) ?? null) : null

    return {
      versionId: row.id,
      label: row.name ?? new Date(row.created_at).toLocaleString(),
      cards: hydrated,
      deckMeta: {
        name: snap.deck.name,
        description: snap.deck.description ?? null,
        format: snap.deck.format ?? null,
        bracket: snap.deck.bracket ?? null,
        commanders: snap.deck.commanders,
        cover_image_scryfall_id: snap.deck.cover_image_scryfall_id,
        is_public: snap.deck.is_public,
      },
      primerMarkdown: snap.primer_markdown,
      coverImageUrl: coverImageUrlSnap,
    }
  }

  const enterVersionView = async (versionId: string) => {
    const row: DeckVersionRow | null = await getVersion(versionId)
    if (!row) {
      toast.error('Version not found')
      return
    }

    const snap = await hydrateVersionSnapshot(row)
    setDeckTitleEditing(false)
    setViewing(snap)
  }

  const openDiffWithVersion = async (versionId: string, label: string) => {
    const row = await getVersion(versionId)
    if (!row) {
      toast.error('Version not found')
      return
    }
    const hydrated = await hydrateVersionSnapshot(row)
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
  const displayedDeckName = viewing ? viewing.deckMeta.name : (deck?.name || 'Loading...')
  const displayedFormat = viewing ? viewing.deckMeta.format : deck?.format ?? null
  const displayedBracket = viewing ? viewing.deckMeta.bracket : deck?.bracket ?? null
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

  const formatViolationMap = useMemo(() => {
    const { violationsByCardId } = validateDeckForFormat(displayedFormat, {
      cards: displayedCards,
      commanderScryfallIds: displayedCommanderIds,
      bracket: displayedBracket,
    })
    return violationsByCardId
  }, [displayedCards, displayedCommanderIds, displayedFormat, displayedBracket])

  const formatHintCardList = useMemo(
    () =>
      displayedCards
        .filter((c) => (formatViolationMap.get(c.id)?.length ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [displayedCards, formatViolationMap]
  )

  const getGroupedCards = () => {
    const sorted = [...displayedCards].sort((a, b) => {
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
        key = getCardTypeGroup(c.type_line)
      } else if (grouping === 'mana') {
        key = `Mana Value ${c.cmc || 0}`
      }
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })
    return groups
  }

  const groupedCards = getGroupedCards()

  /** Group label for a card — matches list view sections so ⋮ menu tag actions stay coherent. */
  const editorGroupNameForCard = (c: DeckCard): string => {
    if (grouping === 'none') return 'All Cards'
    if (grouping === 'type') return getCardTypeGroup(c.type_line)
    if (grouping === 'mana') return `Mana Value ${c.cmc || 0}`
    if (grouping === 'tag') {
      if (!c.tags?.length) return 'Untagged'
      return c.tags[0]
    }
    return 'All Cards'
  }

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
  }, [cardsLoading, cardInteractionKey, grouping, viewMode])

  const showClickedPreview = (card: DeckCard, groupName: string) => {
    setPreviewFaceIndex(0)
    setPreviewFormatHintsHovered(false)
    setClickedPreview({ card, groupName })
    void ensurePrintingsLoaded(card)
  }

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
          <DropdownMenuSubContent className="bg-white border-border text-foreground max-h-80 overflow-y-auto">
            <DropdownMenuItem
              className={c.printing_scryfall_id == null ? 'text-primary' : ''}
              onClick={() => setCardPrinting(c.id, null)}
            >
              Default
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
          <DropdownMenuSubContent className="bg-white border-border text-foreground">
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
          <DropdownMenuSubContent className="bg-white border-border text-foreground">
            {allUniqueTags.map(tag => (
              <DropdownMenuItem
                key={tag}
                className={c.tags?.includes(tag) ? 'text-primary' : ''}
                onClick={() => (c.tags?.includes(tag) ? removeTag(c.id, tag) : addTag(c.id, tag))}
              >
                {c.tags?.includes(tag) ? 'Remove' : 'Add'} {tag}
              </DropdownMenuItem>
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
        <DropdownMenuItem
          className="text-destructive"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void deleteCard(c.id)
          }}
        >
          Remove from Deck
        </DropdownMenuItem>
      </>
    )
  }

  // Render as a plain function (not a component) so React doesn't remount it on parent re-renders
  const renderThreeDotMenu = (c: DeckCard, groupName: string, align: 'start' | 'end' = 'end', fromFormatHintsDialog = false) => {
    if (!isOwner || viewing) return null
    return (
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void ensurePrintingsLoaded(c)
          else if (fromFormatHintsDialog) formatHintsMenuClosedAtRef.current = performance.now()
        }}
      >
        <DropdownMenuTrigger
          aria-label={`Open options for ${c.name}`}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-foreground/25 bg-background/95 text-foreground opacity-100 shadow-lg ring-2 ring-background/80 transition-colors hover:bg-accent hover:text-accent-foreground data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground"
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onContextMenu={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56 bg-white border-border text-foreground">
          {renderDropdownItems(c, groupName)}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  /** Same actions as the ⋮ menu, using Base UI DropdownMenu so pointer hover highlighting matches. */
  const renderPreviewDropdownMenu = (c: DeckCard, groupName: string) => {
    if (!isOwner || viewing) return null
    return (
      <div className="w-56 shrink-0 self-start">
        <DropdownMenu
          modal={false}
          open
          onOpenChange={(next) => {
            if (next) void ensurePrintingsLoaded(c)
            else setClickedPreview(null)
          }}
        >
          <DropdownMenuTrigger
            type="button"
            tabIndex={-1}
            aria-hidden
            className="h-2 w-full cursor-default border-0 bg-transparent p-0 opacity-0"
          />
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={4}
            positionerClassName="z-[90]"
            className="w-56 max-h-[80vh] overflow-y-auto border border-border bg-white text-foreground"
          >
            {renderDropdownItems(c, groupName)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  const cardDragDisabled = interactionsLocked || cardInteractionPhase !== 'ready' || grouping !== 'tag'
  const clickedPreviewCard = clickedPreview
    ? displayedCards.find(card => card.id === clickedPreview.card.id) ?? clickedPreview.card
    : null

  return (
    <div className="fixed top-14 inset-x-0 bottom-0 flex flex-col overflow-hidden bg-background font-sans text-foreground">

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

        {/* Foreground: two rows on mobile, single row on sm+ */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-2 sm:flex-row sm:items-center sm:gap-3 sm:h-14 sm:pb-0">

          {/* Row 1 (mobile) / inlined (sm+): back + deck title */}
          <div className="flex h-9 items-center gap-2 w-full sm:contents">
            <Button variant="ghost" size="sm" onClick={() => router.push(isOwner ? '/decks' : '/')} className="text-muted-foreground hover:text-foreground shrink-0">
              &larr; Back
            </Button>
            <div className="flex flex-1 min-w-0 sm:flex-none sm:shrink-0 items-center gap-2 border-r border-border pr-3">
              {deckTitleEditing && deck ? (
                <div ref={deckTitleFieldRef} className="min-w-0 flex-1 sm:flex-none sm:max-w-[min(100%,28rem)]">
                  <Input
                    value={deckTitleDraft}
                    onChange={e => setDeckTitleDraft(e.target.value)}
                    disabled={deckTitleSaving}
                    onBlur={() => {
                      if (skipDeckTitleBlurCommitRef.current) {
                        skipDeckTitleBlurCommitRef.current = false
                        return
                      }
                      void commitDeckTitleEdit()
                    }}
                    onKeyDown={e => {
                      if (e.key === "Escape") {
                        e.preventDefault()
                        skipDeckTitleBlurCommitRef.current = true
                        setDeckTitleDraft(deck.name ?? "")
                        setDeckTitleEditing(false)
                      } else if (e.key === "Enter") {
                        e.preventDefault()
                        deckTitleFieldRef.current?.querySelector("input")?.blur()
                      }
                    }}
                    className="h-9 w-full font-bold text-base bg-background/70 border-border text-foreground drop-shadow-md md:text-base"
                    aria-label="Deck name"
                  />
                </div>
              ) : (
                <div
                  className={
                    isOwner && !viewing && deck
                      ? "group relative min-w-0 flex-1 max-w-full rounded-md px-2 py-0.5 -mx-1"
                      : "relative min-w-0 flex-1 max-w-full"
                  }
                >
                  {isOwner && !viewing && deck && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-md border border-border/80 bg-background/55 shadow-sm opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
                    />
                  )}
                  <h1
                    className={`relative z-10 min-w-0 truncate font-bold text-base drop-shadow-md sm:whitespace-nowrap ${isOwner && !viewing && deck ? "cursor-text select-none" : ""}`}
                    title={isOwner && !viewing && deck ? "Double-click to rename" : undefined}
                    onDoubleClick={e => {
                      e.preventDefault()
                      if (!isOwner || viewing || !deck) return
                      skipDeckTitleBlurCommitRef.current = false
                      setDeckTitleDraft(deck.name ?? "")
                      setDeckTitleEditing(true)
                    }}
                  >
                    {displayedDeckName}
                  </h1>
                </div>
              )}
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
          </div>

          {/* Row 2 (mobile) / inlined (sm+): search + controls */}
          <div className="flex h-9 items-center gap-2 w-full sm:contents">
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
                        {getCardImageUrl(card, "small") && (
                          <img
                            src={getCardImageUrl(card, "small")}
                            alt=""
                            className="w-7 h-auto rounded shrink-0"
                            draggable={false}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{card.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                        </div>
                        <ManaText text={card.mana_cost} className="text-xs text-muted-foreground shrink-0 ml-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            ) : (
              <div className="flex-1 min-w-0" />
            )}

            {/* Right: settings + export */}
            <div className="flex items-center gap-2 shrink-0">
              {isOwner && !viewing && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-card border border-border hover:bg-accent text-foreground"
                  title="Deck settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              {deck && (
                <>
                  <DeckLikeButton deckId={deckId} />
                  <ExportDeckMenu
                    deckId={deckId}
                    deckName={displayedDeckName}
                    cards={displayedCards}
                    primerMarkdown={viewing ? viewing.primerMarkdown : primerMarkdown}
                    commanderIds={displayedCommanderIds}
                    isPublic={!!deck.is_public}
                    isOwner={isOwner}
                    onVisibilityChange={(pub) => setDeck({ ...deck, is_public: pub })}
                    onImportClick={isOwner && !viewing ? () => setImportOpen(true) : undefined}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

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

      {/* Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-background/20 min-w-0">
        <div className="p-6 max-w-7xl mx-auto space-y-8">
        {tab === 'decklist' && (<>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground">
              Card size
              <input
                type="range"
                min={MIN_CARD_SIZE}
                max={MAX_CARD_SIZE}
                step={4}
                value={cardSize}
                onChange={(e) => setCardSize(Number(e.target.value))}
                className="w-28 accent-primary"
              />
              <span className="w-8 text-right font-mono text-[11px]">{cardSize}</span>
            </label>
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
            {formatViolationMap.size > 0 && isFormatValidationImplemented(displayedFormat) && (
              <button
                type="button"
                onClick={() => setFormatHintsListOpen(true)}
                className="max-w-[14rem] cursor-pointer rounded px-0.5 text-left text-xs leading-snug text-red-400/90 hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                title="Show cards with format hints"
              >
                Format hints · {formatViolationMap.size} card{formatViolationMap.size === 1 ? '' : 's'} (
                {displayedFormat === 'edh' ? 'EDH' : displayedFormat ?? 'format'})
              </button>
            )}
          </div>
          {/* Commanders */}
          {commanderCards.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {commanderCards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="group flex w-64 items-center gap-3 rounded-xl border border-yellow-400/50 bg-card/80 p-2 text-left shadow-lg transition hover:border-yellow-300 overflow-hidden"
                  onClick={() => showClickedPreview(c, 'Commander')}
                >
                  {primaryDeckCardImage(c) ? (
                    <CardThumbnail card={c} className="h-24 shrink-0" imageClassName="h-24 w-auto rounded-lg border border-border/60" overlayClassName="rounded-lg" />
                  ) : (
                    <div className="flex h-24 aspect-[5/7] shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/40">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-yellow-400/90 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-950">
                      <Crown className="h-3 w-3" /> Commander
                    </div>
                    <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.type_line}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {cardsLoading && cards.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[5/7] rounded-xl border border-border/30 bg-card/30 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
                </div>
              ))}
            </div>
          )}
          <DndContext sensors={dndSensors} onDragEnd={handleTagDragEnd}>
          {Object.entries(groupedCards)
            .sort(([a], [b]) => {
              if (a === 'Untagged') return 1
              if (b === 'Untagged') return -1
              return 0
            })
            .map(([groupName, groupCards]) => (
            <DroppableTagGroup key={groupName} id={groupName} enabled={!cardDragDisabled && groupName !== 'Untagged'}>
              <button
                type="button"
                onClick={() => toggleSection(groupName)}
                onDoubleClick={(e) => { e.preventDefault(); toggleAllSections(Object.keys(groupedCards), e.currentTarget) }}
                className="flex w-full items-center gap-2 border-b border-border pb-2 mb-4 text-left group"
              >
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${collapsedSections.has(groupName) ? '-rotate-90' : ''}`} />
                <h3 className="text-xl font-bold text-foreground">
                  {groupName}{' '}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({groupCards.reduce((a, c) => a + c.quantity, 0)})
                  </span>
                </h3>
              </button>
              {collapsedSections.has(groupName) ? null : (<>

              {/* ── VISUAL VIEW ── */}
              {viewMode === 'visual' && (
                <div
                  className="grid justify-start gap-4"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))` }}
                >
                  {groupCards.map(c => {
                    const vlist = formatViolationMap.get(c.id)
                    const printings = printingsByCard[c.id] ?? []
                    const finishes = c.available_finishes ?? ['nonfoil']
                    return (
                    <ContextMenu key={c.id} onOpenChange={(o) => { if (o) void ensurePrintingsLoaded(c) }}>
                      <ContextMenuTrigger>
                        <DraggableDeckCard
                          id={deckCardDragId(grouping, groupName, c.id)}
                          disabled={cardDragDisabled}
                          onMouseEnter={vlist && vlist.length > 0 ? () => setDeckFormatHintHoverId(c.id) : undefined}
                          onMouseLeave={vlist && vlist.length > 0 ? () => setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev)) : undefined}
                          className={`relative rounded-xl overflow-hidden border cursor-grab active:cursor-grabbing shadow-xl aspect-[5/7] transition-all ${visualDeckCardChrome(c, {
                            commanderIds: displayedCommanderIds,
                            coverImageId: displayedCoverImageId,
                            violations: vlist,
                          })}`}
                          style={{ width: cardSize }}
                        >
                          <button
                            type="button"
                            className="absolute inset-0 z-10 cursor-grab bg-transparent p-0 text-left active:cursor-grabbing"
                            aria-label={`Preview ${c.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              showClickedPreview(c, groupName)
                            }}
                          />
                          <CardThumbnail card={c} className="h-full w-full" imageClassName="h-full w-full object-cover" overlayClassName="rounded-none" />
                          {displayedCommanderIds.includes(c.scryfall_id) && (
                            <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg">
                              <Crown className="w-2.5 h-2.5" /> CMD
                            </div>
                          )}
                          {displayedCoverImageId === c.scryfall_id && (
                            <div
                              className="absolute left-2 bg-blue-400/90 text-blue-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg"
                              style={{ top: displayedCommanderIds.includes(c.scryfall_id) ? '1.75rem' : '0.5rem' }}
                            >
                              <ImageIcon className="w-2.5 h-2.5" /> Cover
                            </div>
                          )}
                          {c.quantity > 1 && (
                            <div
                              className={`absolute top-2 right-8 bg-background/80 text-foreground px-1.5 py-0.5 rounded text-xs font-bold border border-border transition-opacity ${
                                vlist && vlist.length > 0 && deckFormatHintHoverId === c.id ? 'opacity-0' : 'opacity-100'
                              }`}
                            >
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
                          <div className="absolute bottom-1 right-1 z-20 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                            {formatPrice(c.price_usd)}
                          </div>
                          {vlist && vlist.length > 0 && (
                            <div
                              className={`pointer-events-none absolute inset-x-1 bottom-9 z-[25] max-h-[42%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                                deckFormatHintHoverId === c.id ? 'opacity-100' : 'opacity-0'
                              }`}
                            >
                              <div className="rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-left text-[10px] leading-snug text-red-100">
                                <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                                <ul className="space-y-0.5">
                                  {vlist.map((line) => (
                                    <li key={line} className="list-disc pl-3.5 marker:text-red-400/90">
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
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
                        </DraggableDeckCard>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56 bg-white border-border text-foreground">
                        <ContextMenuItem
                          onClick={() => setAsCommander(c.scryfall_id)}
                          className={commanderIds.includes(c.scryfall_id) ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 focus:text-yellow-300 focus:bg-yellow-400/10' : ''}
                        >
                          <Crown className="w-3.5 h-3.5 mr-2" />
                          {commanderIds.includes(c.scryfall_id) ? 'Remove as Commander' : 'Set as Commander'}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => setAsCoverImage(c.scryfall_id)}
                          className={coverImageId === c.scryfall_id ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 focus:text-blue-300 focus:bg-blue-400/10' : ''}
                        >
                          <ImageIcon className="w-3.5 h-3.5 mr-2" />
                          {coverImageId === c.scryfall_id ? 'Remove Cover Image' : 'Set as Cover Image'}
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-border" />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger onMouseEnter={() => void ensurePrintingsLoaded(c)}>Printing</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="max-h-80 overflow-y-auto bg-white border-border text-foreground">
                            <ContextMenuItem
                              className={c.printing_scryfall_id == null ? 'text-primary' : ''}
                              onClick={() => setCardPrinting(c.id, null)}
                            >
                              Default
                            </ContextMenuItem>
                            {printings.length > 0 && <ContextMenuSeparator className="bg-border" />}
                            {printings.map(p => (
                              <ContextMenuItem
                                key={p.id}
                                className={c.printing_scryfall_id === p.id ? 'text-primary' : ''}
                                onClick={() => setCardPrinting(c.id, p.id)}
                              >
                                <span className="font-mono text-xs mr-2 text-muted-foreground">{p.set?.toUpperCase()}</span>
                                {p.set_name}
                                <span className="ml-auto text-xs text-muted-foreground">{(p.released_at ?? '').slice(0, 4)}</span>
                              </ContextMenuItem>
                            ))}
                            {printings.length === 0 && c.oracle_id && (
                              <ContextMenuItem disabled>Loading printings...</ContextMenuItem>
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>Foil</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border-border text-foreground">
                            <ContextMenuItem
                              disabled={!finishes.includes('nonfoil')}
                              className={c.finish === 'nonfoil' ? 'text-primary' : ''}
                              onClick={() => setCardFinish(c.id, 'nonfoil')}
                            >Non-foil</ContextMenuItem>
                            <ContextMenuItem
                              disabled={!finishes.includes('foil')}
                              className={c.finish === 'foil' ? 'text-primary' : ''}
                              onClick={() => setCardFinish(c.id, 'foil')}
                            >Foil</ContextMenuItem>
                            <ContextMenuItem
                              disabled={!finishes.includes('etched')}
                              className={c.finish === 'etched' ? 'text-primary' : ''}
                              onClick={() => setCardFinish(c.id, 'etched')}
                            >Etched</ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator className="bg-border" />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-white border-border text-foreground">
                            {allUniqueTags.map(tag => (
                              <ContextMenuItem
                                key={tag}
                                className={c.tags?.includes(tag) ? 'text-primary' : ''}
                                onClick={() => c.tags?.includes(tag) ? removeTag(c.id, tag) : addTag(c.id, tag)}
                              >
                                {c.tags?.includes(tag) ? 'Remove' : 'Add'} {tag}
                              </ContextMenuItem>
                            ))}
                            {allUniqueTags.length > 0 && <ContextMenuSeparator className="bg-border" />}
                            <ContextMenuItem onClick={() => { setActiveCardIdForTag(c.id); setTagDialogOpen(true) }}>Add Custom Tag...</ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator className="bg-border" />
                        {grouping === 'tag' && groupName !== 'Untagged' && (
                          <>
                            <ContextMenuItem className="text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 focus:text-orange-300 focus:bg-orange-400/10" onClick={() => removeTag(c.id, groupName)}>
                              Remove from &apos;{groupName}&apos;
                            </ContextMenuItem>
                            <ContextMenuSeparator className="bg-border" />
                          </>
                        )}
                        <ContextMenuItem className="text-destructive hover:text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10" onClick={() => deleteCard(c.id)}>
                          Remove from Deck
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    )
                  })}
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
                  <div className="flex flex-wrap gap-8">
                    {columns.map((colCards, colIdx) => {
                      // Compute static base top positions; card 0 at top (rearmost)
                      const basePositions: number[] = []
                      let accY = 0
                      colCards.forEach(card => {
                        basePositions.push(accY)
                        accY += stackPeek + (card.quantity > 1 ? stackExtraPeek : 0)
                      })
                      const colHeight = accY + stackCardHeight + stackHoverShift

                      return (
                        <div
                          key={colIdx}
                          className="relative shrink-0"
                          style={{ width: cardSize, height: colHeight }}
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
                          onMouseLeave={() => {
                            setHoveredStack(null)
                          }}
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
                            const stackViolations = formatViolationMap.get(card.id)

                            const dragStyle: CSSProperties = {
                              top: basePositions[itemIdx],
                              zIndex: isHovered ? colCards.length + 10 : itemIdx + 1,
                            }

                            return (
                              <DraggableDeckCard
                                key={card.id}
                                id={deckCardDragId(grouping, groupName, card.id)}
                                disabled={cardDragDisabled}
                                className="absolute w-full cursor-grab active:cursor-grabbing group"
                                style={dragStyle}
                              >
                                <motion.div
                                  className={`relative rounded-xl${stackViolations?.length ? ' ring-2 ring-red-500/55 ring-offset-2 ring-offset-background' : ''}`}
                                  animate={{
                                    y: isHovered ? -12 : isBelow ? stackHoverShift : 0,
                                    scale: isHovered ? 1.05 : 1,
                                  }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.4 }}
                                >
                                <button
                                  type="button"
                                  className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
                                  aria-label={`Preview ${card.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    showClickedPreview(card, groupName)
                                  }}
                                />
                                <CardThumbnail card={card} imageClassName="w-full rounded-xl border border-black/60 shadow-xl" />
                                {stackViolations && stackViolations.length > 0 && (
                                  <div
                                    className={`pointer-events-none absolute inset-x-1 bottom-9 z-[25] max-h-[42%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                                      isHovered ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  >
                                    <div className="rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-left text-[10px] leading-snug text-red-100">
                                      <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                                      <ul className="space-y-0.5">
                                        {stackViolations.map((line) => (
                                          <li key={line} className="list-disc pl-3.5 marker:text-red-400/90">
                                            {line}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                                {card.quantity > 1 && (
                                  <div className="absolute top-2 right-2 bg-background/85 text-foreground text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-border/60 shadow-sm leading-none">
                                    {card.quantity}x
                                  </div>
                                )}
                                {displayedCommanderIds.includes(card.scryfall_id) && (
                                  <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-0.5 shadow">
                                    <Crown className="w-2.5 h-2.5" /> CMD
                                  </div>
                                )}
                                {/* Three-dot menu (top-right) */}
                                <div className="absolute top-2 right-2 z-20">
                                  {renderThreeDotMenu(card, groupName, 'end')}
                                </div>
                                {/* Cost (bottom-right) */}
                                {itemIdx === colCards.length - 1 && (
                                  <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-xs font-bold border border-border tabular-nums">
                                    {formatPrice(card.price_usd)}
                                  </div>
                                )}
                                </motion.div>
                              </DraggableDeckCard>
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
                  {groupCards.map(c => {
                    const listV = formatViolationMap.get(c.id)
                    return (
                    <DraggableDeckCard
                      key={c.id}
                      id={deckCardDragId(grouping, groupName, c.id)}
                      disabled={cardDragDisabled}
                      onMouseEnter={listV && listV.length > 0 ? () => setDeckFormatHintHoverId(c.id) : undefined}
                      onMouseLeave={listV && listV.length > 0 ? () => setDeckFormatHintHoverId((prev) => (prev === c.id ? null : prev)) : undefined}
                      className={`flex items-center justify-between p-2 hover:bg-accent/50 border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg relative cursor-grab active:cursor-grabbing${listV?.length ? ' border-l-4 border-l-red-500' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        showClickedPreview(c, groupName)
                      }}
                    >
                      <div className="relative z-0 flex min-w-0 flex-1 items-center gap-3">
                        <span className="text-muted-foreground w-4 text-right font-mono">{c.quantity}</span>
                        {(c.face_images?.[0] || c.image_url) && <CardThumbnail card={c} className="h-9 shrink-0" imageClassName="h-9 w-auto rounded border border-border/50" overlayClassName="rounded" />}
                        <ManaText text={c.name} className="font-medium cursor-pointer hover:text-primary transition-colors truncate" />
                        <ManaText text={c.mana_cost} className="text-xs text-muted-foreground" />
                      </div>
                      <div className="flex items-center gap-3 ml-auto shrink-0">
                        <span className="text-xs font-mono text-muted-foreground tabular-nums w-16 text-right">
                          {formatPrice(c.price_usd)}
                        </span>
                        {renderThreeDotMenu(c, groupName, 'end')}
                      </div>
                      {listV && listV.length > 0 && (
                        <div
                          className={`pointer-events-none absolute inset-x-2 top-1/2 z-30 max-h-[calc(100%-0.5rem)] -translate-y-1/2 overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                            deckFormatHintHoverId === c.id ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <div className="ml-auto w-[min(100%,22rem)] rounded-md border border-red-600 bg-zinc-950 px-2 py-1.5 text-[10px] leading-snug text-red-100">
                            <div className="mb-0.5 font-semibold text-red-300">Format hints</div>
                            <ul className="space-y-0.5">
                              {listV.map((line) => (
                                <li key={line} className="list-disc pl-3.5 text-left marker:text-red-400/90">
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </DraggableDeckCard>
                    )
                  })}
                </div>
              )}
            </>)}
            </DroppableTagGroup>
          ))}
          </DndContext>

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

      <Dialog open={formatHintsListOpen} onOpenChange={setFormatHintsListOpen}>
        <DialogContent className="flex max-h-[min(88vh,720px)] flex-col border border-border bg-card text-foreground sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Format hints</DialogTitle>
            <DialogDescription>
              {formatHintCardList.length} card{formatHintCardList.length === 1 ? '' : 's'} that do not match{' '}
              {displayedFormat === 'edh' ? 'EDH' : 'the selected'} construction hints.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/50">
            {formatHintCardList.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No cards to show.</p>
            ) : (
              formatHintCardList.map((c) => {
                const hintLines = formatViolationMap.get(c.id) ?? []
                const gn = editorGroupNameForCard(c)
                return (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between border-b border-border p-2 last:border-0 hover:bg-accent/50${hintLines.length ? ' border-l-4 border-l-red-500' : ''}`}
                  >
                    <div
                      className="relative z-0 flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                      onClick={() => {
                        if (performance.now() - formatHintsMenuClosedAtRef.current < 450) return
                        setFormatHintsListOpen(false)
                        showClickedPreview(c, gn)
                      }}
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-muted-foreground">{c.quantity}</span>
                      {(c.face_images?.[0] || c.image_url) && (
                        <CardThumbnail
                          card={c}
                          className="h-9 shrink-0"
                          imageClassName="h-9 w-auto rounded border border-border/50"
                          overlayClassName="rounded"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <ManaText text={c.name} className="truncate font-medium text-foreground" />
                        <ManaText text={c.mana_cost} className="text-xs text-muted-foreground" />
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-red-300/95">{hintLines.join(' · ')}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="w-16 text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {formatPrice(c.price_usd)}
                      </span>
                      {renderThreeDotMenu(c, gn, 'end', true)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={diffOpen && !!diffTarget} onOpenChange={(open) => { setDiffOpen(open); if (!open) setDiffTarget(null) }}>
        <DialogContent overlayClassName="bg-background/95 supports-backdrop-filter:backdrop-blur-none" className="max-h-[88vh] overflow-y-auto border border-border bg-background text-foreground shadow-2xl sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Diff with latest</DialogTitle>
            <DialogDescription>
              Compare a saved version against the current latest decklist.
            </DialogDescription>
          </DialogHeader>
          {diffTarget && (
            <DeckDiffView
              before={{ label: diffTarget.label, cards: diffTarget.cards }}
              after={{ label: "Latest", cards }}
            />
          )}
        </DialogContent>
      </Dialog>


      {clickedPreview && clickedPreviewCard && (() => {
        const pv = formatViolationMap.get(clickedPreviewCard.id)
        return (
        <div
          className="fixed inset-0 z-[80] bg-background/20 backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClickedPreview(null)
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 items-start gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative flex w-80 shrink-0 flex-col items-center"
              onMouseEnter={() => {
                if (pv?.length) setPreviewFormatHintsHovered(true)
              }}
              onMouseLeave={() => setPreviewFormatHintsHovered(false)}
            >
              <CardArt
                card={clickedPreviewCard}
                imageClassName={`w-80 rounded-xl border shadow-2xl ${pv?.length ? 'border-red-500/70' : 'border-border/50'}`}
                faceIndex={previewFaceIndex}
                onFlip={() => setPreviewFaceIndex(i => i + 1)}
              />
              {pv && pv.length > 0 && (
                <div
                  className={`pointer-events-none absolute inset-x-2 bottom-3 z-20 max-h-[45%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                    previewFormatHintsHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <div className="rounded-lg border border-red-600 bg-zinc-950 px-3 py-2 text-xs text-red-100">
                    <div className="font-semibold text-red-300">Format hints</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {pv.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            {renderPreviewDropdownMenu(clickedPreviewCard, clickedPreview.groupName)}
          </div>
        </div>
        )
      })()}

      <Dialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Revert deck to this version?</DialogTitle>
            <DialogDescription>
              Your current deck state will be saved as a new version before reverting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevertConfirmOpen(false)} disabled={reverting} className="hover:bg-accent hover:text-accent-foreground">Cancel</Button>
            <Button onClick={handleRevertFromBanner} disabled={reverting}>{reverting ? "Reverting..." : "Revert"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
