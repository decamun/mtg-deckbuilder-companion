"use client"

import { useState, useEffect, use } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, LayoutGrid, List, Layers as StackIcon, Trash, Crown, Image as ImageIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase/client"
import { searchCards, getCard, ScryfallCard } from "@/lib/scryfall"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface DeckCard {
  id: string
  scryfall_id: string
  name: string
  quantity: number
  zone: string
  tags: string[]
  // runtime populated
  image_url?: string
  type_line?: string
  mana_cost?: string
  cmc?: number
}

export default function DeckWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params)
  const router = useRouter()
  
  const [deck, setDeck] = useState<any>(null)
  const [cards, setCards] = useState<DeckCard[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScryfallCard[]>([])
  
  const [viewMode, setViewMode] = useState<'visual' | 'stack' | 'list'>('visual')
  const [grouping, setGrouping] = useState<'none' | 'type' | 'mana' | 'tag'>('type')
  const [sorting, setSorting] = useState<'name' | 'mana'>('name')
  const debouncedQuery = useDebounce(query, 500)
  
  // Commander & cover image state
  const [commanderIds, setCommanderIds] = useState<string[]>([])
  const [coverImageId, setCoverImageId] = useState<string | null>(null)

  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState("")
  const [activeCardIdForTag, setActiveCardIdForTag] = useState<string | null>(null)

  useEffect(() => {
    fetchDeck()
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deck_cards', filter: `deck_id=eq.${deckId}` }, fetchDeck)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [deckId])

  useEffect(() => {
    if (debouncedQuery.length > 2) {
      searchCards(debouncedQuery).then(setResults)
    } else {
      setResults([])
    }
  }, [debouncedQuery])

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
    setCommanderIds(deckData?.commander_scryfall_ids || [])
    setCoverImageId(deckData?.cover_image_scryfall_id || null)

    const { data: cardsData, error: cardsError } = await supabase
      .from('deck_cards')
      .select('*')
      .eq('deck_id', deckId)

    if (cardsError) {
      toast.error('Failed to load cards')
      return
    }

    if (cardsData) {
      // Hydrate from Scryfall
      const hydrated = await Promise.all(cardsData.map(async (c) => {
        const sf = await getCard(c.scryfall_id)
        return {
          ...c,
          image_url: sf?.image_uris?.normal,
          type_line: sf?.type_line || '',
          mana_cost: sf?.mana_cost || '',
          cmc: sf ? calculateCmc(sf.mana_cost) : 0
        }
      }))
      setCards(hydrated)
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

  const deleteCard = async (id: string) => {
    await supabase.from('deck_cards').delete().eq('id', id)
  }

  const setAsCommander = async (scryfallId: string) => {
    let newIds: string[]
    if (commanderIds.includes(scryfallId)) {
      // Toggle off
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
      // Toggle off
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
    const currentTags = card.tags || []
    const newTags = currentTags.filter(t => t !== tag)
    
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, tags: newTags } : c))
    await supabase.from('deck_cards').update({ tags: newTags }).eq('id', cardId)
  }

  const handleCustomTagSubmit = () => {
    if (activeCardIdForTag && customTagInput) {
      addTag(activeCardIdForTag, customTagInput)
    }
    setTagDialogOpen(false)
    setCustomTagInput("")
    setActiveCardIdForTag(null)
  }

  const allUniqueTags = Array.from(new Set(cards.flatMap(c => c.tags || []))).sort()

  // --- Grouping and Sorting ---
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

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      <header className="border-b border-border bg-secondary/80 backdrop-blur-md h-14 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/decks')} className="text-muted-foreground hover:text-foreground">
            &larr; Back
          </Button>
          <h1 className="font-bold text-lg">{deck?.name || 'Loading...'}</h1>
          <Badge variant="outline" className="border-border text-muted-foreground">{cards.reduce((a,c)=>a+c.quantity, 0)} Cards</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={grouping} onValueChange={(v: any) => setGrouping(v)}>
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
          <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="bg-card rounded-md p-0.5 border border-border">
            <TabsList className="h-7 bg-transparent">
              <TabsTrigger value="visual" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><LayoutGrid className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="stack" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><StackIcon className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="list" className="px-2 h-6 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"><List className="w-3.5 h-3.5" /></TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Search Sidebar */}
        <aside className="w-80 border-r border-border bg-card/30 flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search Scryfall..." 
                className="pl-8 bg-background/50 border-border text-foreground h-9"
                value={query} onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {results.map((card) => (
                <div key={card.id} onClick={() => addToDeck(card)} className="relative rounded-lg overflow-hidden cursor-pointer border border-border/50 hover:border-primary/50 group">
                  {card.image_uris && <img src={card.image_uris.normal} className="w-full object-cover" />}
                  <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-primary px-3 py-1 rounded-full text-xs font-bold shadow-lg text-primary-foreground">+ Add</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Workspace */}
        <section className="flex-1 bg-background/20 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            {Object.entries(groupedCards).map(([groupName, groupCards]) => (
              <div key={groupName}
                onDragOver={(e) => {
                  if (grouping === 'tag') e.preventDefault()
                }}
                onDrop={(e) => {
                  if (grouping === 'tag' && groupName !== 'Untagged') {
                    const cardId = e.dataTransfer.getData('cardId')
                    addTag(cardId, groupName)
                  }
                }}
              >
                <h3 className="text-xl font-bold border-b border-border pb-2 mb-4 text-foreground">
                  {groupName} <span className="text-sm font-normal text-muted-foreground ml-2">({groupCards.reduce((a,c)=>a+c.quantity, 0)})</span>
                </h3>
                
                {viewMode === 'visual' && (
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                    {groupCards.map(c => (
                      <ContextMenu key={c.id}>
                        <ContextMenuTrigger>
                          <div 
                            className={`relative rounded-xl overflow-hidden border cursor-pointer shadow-xl group aspect-[5/7] transition-all ${
                              commanderIds.includes(c.scryfall_id)
                                ? 'border-yellow-400/80 ring-2 ring-yellow-400/40 hover:border-yellow-300'
                                : coverImageId === c.scryfall_id
                                  ? 'border-blue-400/80 ring-2 ring-blue-400/40 hover:border-blue-300'
                                  : 'border-border hover:border-primary/50'
                            }`}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('cardId', c.id)}
                          >
                            <img src={c.image_url} className="w-full h-full object-cover" />
                            {c.quantity > 1 && (
                              <div className="absolute top-2 right-2 bg-background/80 text-foreground px-2 py-0.5 rounded text-xs font-bold border border-border">x{c.quantity}</div>
                            )}
                            {commanderIds.includes(c.scryfall_id) && (
                              <div className="absolute top-2 left-2 bg-yellow-400/90 text-yellow-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg">
                                <Crown className="w-2.5 h-2.5" /> CMD
                              </div>
                            )}
                            {coverImageId === c.scryfall_id && (
                              <div className="absolute top-2 left-2 bg-blue-400/90 text-blue-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg" style={{top: commanderIds.includes(c.scryfall_id) ? '1.75rem' : ''}}>
                                <ImageIcon className="w-2.5 h-2.5" /> Cover
                              </div>
                            )}
                            {c.tags && c.tags.length > 0 && (
                              <div className="absolute bottom-1 right-1 flex flex-wrap justify-end gap-1 p-1 max-w-full">
                                {c.tags.map(t => <Badge key={t} className="text-[10px] px-1.5 py-0 bg-background/80 text-foreground border-border truncate max-w-full">{t}</Badge>)}
                              </div>
                            )}
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
                              <ContextMenuItem className="text-orange-400 focus:text-orange-300 focus:bg-orange-400/10" onClick={() => removeTag(c.id, groupName)}>Remove from '{groupName}'</ContextMenuItem>
                              <ContextMenuSeparator className="bg-border" />
                            </>
                          )}
                          <ContextMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => deleteCard(c.id)}>Remove from Deck</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </div>
                )}

                {viewMode === 'stack' && (
                  <div className="flex flex-wrap gap-8">
                    {groupCards.map(c => (
                      <div 
                        key={c.id} 
                        className="relative w-40 group cursor-pointer" 
                        style={{ height: 280 + (c.quantity-1)*30 }}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('cardId', c.id)}
                      >
                        {Array.from({length: c.quantity}).map((_, i) => (
                          <motion.img
                            key={i}
                            src={c.image_url}
                            className="absolute w-full rounded-xl border border-black shadow-2xl transition-transform duration-300"
                            style={{ top: i * 30, zIndex: i }}
                            whileHover={{ y: -20, scale: 1.05, zIndex: 100 }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'list' && (
                  <div className="bg-card/50 rounded-lg border border-border overflow-hidden">
                    {groupCards.map(c => (
                      <div 
                        key={c.id} 
                        className="flex items-center justify-between p-2 hover:bg-accent/50 border-b border-border last:border-0 group relative"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('cardId', c.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground w-4 text-right font-mono">{c.quantity}</span>
                          <span className="font-medium cursor-pointer hover:text-primary transition-colors">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.mana_cost}</span>
                        </div>
                        {/* Hover Image Popover */}
                        <div className="hidden group-hover:block absolute left-1/3 top-0 -translate-y-1/2 z-50 pointer-events-none drop-shadow-2xl">
                           <img src={c.image_url} className="w-48 rounded-xl border border-border/50" />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteCard(c.id)} className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20 opacity-0 group-hover:opacity-100"><Trash className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

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
              onKeyDown={e => {
                if (e.key === 'Enter') handleCustomTagSubmit()
              }}
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
