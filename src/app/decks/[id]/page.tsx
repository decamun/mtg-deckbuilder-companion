"use client"

import { useState, useEffect, use, useRef } from "react"
import { motion } from "framer-motion"
import { Search, LayoutGrid, List, Layers as StackIcon, Crown, Image as ImageIcon, MoreVertical } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCardsByIds, getCard, ScryfallCard } from "@/lib/scryfall"
import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { DeckAnalytics } from "@/components/deck-analytics"

// Stack card width is w-44 (176px); height ≈ 176 * 1.4 = 246px
const STACK_PEEK = 32
const STACK_EXTRA_PEEK = 14
const STACK_CARD_HEIGHT = 246
const STACK_HOVER_SHIFT = 44

export default function DeckWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params)
  const router = useRouter()

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

  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Drag coordination. HTML5 drag is hostile to DOM mutations mid-drag —
  // re-renders that unmount the source element before dragend deadlock the
  // browser's drag state. So we defer all state changes triggered during
  // drag (drops, real-time refreshes) until dragend fires.
  const isDragging = useRef(false)
  const pendingDrop = useRef<{ cardId: string; tag: string } | null>(null)
  const pendingFetch = useRef(false)
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
    const onDragEnd = () => {
      isDragging.current = false
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
    const authenticatedUserId = session?.user.id
    if (!authenticatedUserId) {
      router.push('/')
      return
    }

    const { data: deckData, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', authenticatedUserId)
      .single()

    if (deckError) {
      toast.error('Failed to load deck')
      router.push('/decks')
      return
    }

    setDeck(deckData)
    setCommanderIds(deckData.commander_scryfall_ids || [])
    setCoverImageId(deckData.cover_image_scryfall_id || null)

    const { data: cardsData, error: cardsError } = await supabase
      .from('deck_cards')
      .select('*')
      .eq('deck_id', deckData.id)

    if (cardsError) {
      toast.error('Failed to load cards')
      return
    }

    if (cardsData) {
      const sfCards = await getCardsByIds(cardsData.map(c => c.scryfall_id))
      const sfMap = new Map(sfCards.map(c => [c.id, c]))
      const hydrated = cardsData.map(c => {
        const sf = sfMap.get(c.scryfall_id)
        return {
          ...c,
          image_url: sf?.image_uris?.normal,
          type_line: sf?.type_line || '',
          mana_cost: sf?.mana_cost || '',
          cmc: sf?.cmc ?? (sf ? calculateCmc(sf.mana_cost) : 0),
          colors: sf?.colors ?? [],
        }
      })
      setCards(hydrated)

      // Resolve cover image URL — prefer in-deck card, fall back to a separate fetch.
      const coverId = deckData.cover_image_scryfall_id || null
      if (coverId) {
        const inDeck = sfMap.get(coverId)
        if (inDeck?.image_uris?.normal) {
          setCoverImageUrl(inDeck.image_uris.normal)
        } else {
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
    } else {
      await supabase.from('deck_cards').insert({ deck_id: deckId, scryfall_id: card.id, name: card.name, quantity: 1 })
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
    await supabase.from('deck_cards').delete().eq('id', id)
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
    toast.success(newIds.includes(scryfallId) ? 'Set as commander!' : 'Removed as commander')
  }

  const setAsCoverImage = async (scryfallId: string) => {
    if (coverImageId === scryfallId) {
      setCoverImageId(null)
      await supabase.from('decks').update({ cover_image_scryfall_id: null }).eq('id', deckId)
      toast.success('Cover image removed')
    } else {
      setCoverImageId(scryfallId)
      await supabase.from('decks').update({ cover_image_scryfall_id: scryfallId }).eq('id', deckId)
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
  }

  const removeTag = async (cardId: string, tag: string) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const newTags = (card.tags || []).filter(t => t !== tag)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
  }

  const handleCustomTagSubmit = () => {
    if (activeCardIdForTag && customTagInput) addTag(activeCardIdForTag, customTagInput)
    setTagDialogOpen(false)
    setCustomTagInput("")
    setActiveCardIdForTag(null)
  }

  // Keep latest addTag/fetchDeck reachable from the stable window dragend listener
  dragCallbacksRef.current = { addTag, fetchDeck }

  const allUniqueTags = Array.from(new Set(cards.flatMap(c => c.tags || []))).sort()

  const getGroupedCards = () => {
    let sorted = [...cards].sort((a, b) => {
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
  const renderDropdownItems = (c: DeckCard, groupName: string) => (
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

  // Render as a plain function (not a component) so React doesn't remount it on parent re-renders
  const renderThreeDotMenu = (c: DeckCard, groupName: string, align: 'start' | 'end' = 'end') => (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="h-7 w-7 flex items-center justify-center bg-background/75 hover:bg-background/95 rounded-full border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onContextMenu={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48 bg-card border-border text-foreground">
        {renderDropdownItems(c, groupName)}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="fixed top-14 inset-x-0 bottom-0 flex flex-col overflow-hidden bg-background font-sans text-foreground">

      {/* Combined toolbar: title | search | controls — banner with cover image background */}
      <header className="border-b border-border h-28 shrink-0 relative z-40">
        {/* Background: cover image with gradient overlay (clipped to banner), or fallback */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {coverImageUrl ? (
            <>
              <img
                src={coverImageUrl}
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
        <Button variant="ghost" size="sm" onClick={() => router.push('/decks')} className="text-muted-foreground hover:text-foreground shrink-0">
          &larr; Back
        </Button>
        <div className="flex items-center gap-2 shrink-0 border-r border-border pr-3">
          <h1 className="font-bold text-base whitespace-nowrap drop-shadow-md">{deck?.name || 'Loading...'}</h1>
          <Badge variant="outline" className="border-border text-muted-foreground shrink-0 bg-background/40 backdrop-blur-sm">
            {cards.reduce((a, c) => a + c.quantity, 0)}
          </Badge>
        </div>

        {/* Center: add-a-card search */}
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

        {/* Right: group + view controls */}
        <div className="flex items-center gap-2 shrink-0">
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
        </div>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex-1 overflow-y-auto bg-background/20">
        <div className="p-6 max-w-6xl mx-auto space-y-8">
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
                          <img src={c.image_url} className="w-full h-full object-cover" />
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
                            <div className="absolute bottom-1 right-1 flex flex-wrap justify-end gap-1 p-1 max-w-full">
                              {c.tags.map(t => (
                                <Badge key={t} className="text-[10px] px-1.5 py-0 bg-background/80 text-foreground border-border truncate max-w-full">{t}</Badge>
                              ))}
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
                                <img
                                  src={card.image_url}
                                  className="w-full rounded-xl border border-black/60 shadow-xl"
                                  draggable={false}
                                />
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
                                {/* Three-dot menu shows on card hover */}
                                <div className="absolute bottom-3 right-2 z-10">
                                  {renderThreeDotMenu(card, groupName, 'end')}
                                </div>
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
                      {renderThreeDotMenu(c, groupName, 'end')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* ── Analytics ── */}
          <div className="border-t border-border pt-8 mt-4">
            <DeckAnalytics
              cards={cards.filter(c => !commanderIds.includes(c.scryfall_id))}
              commanders={cards.filter(c => commanderIds.includes(c.scryfall_id))}
            />
          </div>
        </div>
      </div>

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
