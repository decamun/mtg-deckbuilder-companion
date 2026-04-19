"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Layers, Plus, MoreVertical, Edit, Copy, Trash, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getCard, getCardsCollection } from "@/lib/scryfall"

interface Deck {
  id: string
  name: string
  format: string | null
  cover_image_scryfall_id: string | null
  cover_url?: string // Client-side augmented
}

export default function MyDecks() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [newDeckName, setNewDeckName] = useState("")
  const [decklistText, setDecklistText] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchDecks()
  }, [])

  const fetchDecks = async () => {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) {
      router.push('/')
      return
    }

    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error("Failed to load decks")
      return
    }

    // Hydrate cover images from Scryfall
    const populatedDecks = await Promise.all(data.map(async (deck) => {
      let cover_url = undefined
      if (deck.cover_image_scryfall_id) {
        const card = await getCard(deck.cover_image_scryfall_id)
        if (card?.image_uris) cover_url = card.image_uris.normal
      }
      return { ...deck, cover_url }
    }))

    setDecks(populatedDecks)
    setLoading(false)
  }

  function parseDecklist(text: string) {
    const lines = text.split('\n')
    const cards: { quantity: number, name: string }[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//')) continue
      const match = trimmed.match(/^(\d+)[xX]?\s+(.+)$/)
      if (match) {
        const quantity = parseInt(match[1])
        const name = match[2].replace(/(?: \([^)]+\)| \[[^\]]+\])(?: \d+[a-zA-Z]?)?$/, '').trim()
        cards.push({ quantity, name })
      } else {
        cards.push({ quantity: 1, name: trimmed.replace(/(?: \([^)]+\)| \[[^\]]+\])(?: \d+[a-zA-Z]?)?$/, '').trim() })
      }
    }
    return cards
  }

  const handleCreateDeck = async () => {
    if (!newDeckName) return
    setIsCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsCreating(false)
      return
    }

    const { data, error } = await supabase
      .from('decks')
      .insert({ name: newDeckName, user_id: user.id })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setIsCreating(false)
      return
    }

    if (decklistText.trim()) {
      const parsedCards = parseDecklist(decklistText)
      const uniqueNames = Array.from(new Set(parsedCards.map(p => p.name)))
      const scryfallCards = await getCardsCollection(uniqueNames)

      let addedCount = 0
      const inserts = []

      for (const parsed of parsedCards) {
        const scryfallCard = scryfallCards.find(c => c.name.toLowerCase() === parsed.name.toLowerCase())
        if (scryfallCard) {
          inserts.push({
            deck_id: data.id,
            scryfall_id: scryfallCard.id,
            name: scryfallCard.name,
            quantity: parsed.quantity
          })
          addedCount++
        } else {
          toast.error(`Could not find card: ${parsed.name}`)
        }
      }

      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from('deck_cards').insert(inserts)
        if (insertError) {
          toast.error(`Error saving cards: ${insertError.message}`)
        }
      }

      toast.success(`Deck created with ${addedCount} unique cards!`)
    } else {
      toast.success("Deck created!")
    }

    setIsCreating(false)
    setIsDialogOpen(false)
    setNewDeckName("")
    setDecklistText("")
    router.push(`/decks/${data.id}`)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const { error } = await supabase.from('decks').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success("Deck deleted")
      setDecks(decks.filter(d => d.id !== id))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border bg-secondary/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold">My Decks</h1>
          </div>
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Your Arsenal</h2>
            <p className="text-muted-foreground mt-1">Manage and build your magic decks.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<Button className="bg-primary hover:bg-primary/90 text-primary-foreground" />}>
              <Plus className="w-4 h-4 mr-2" /> New Deck
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle>Create New Deck</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Deck Name</Label>
                  <Input
                    id="name"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    className="bg-background/50 border-border"
                    placeholder="e.g. Modern Tron"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decklist">Decklist (Optional)</Label>
                  <Textarea
                    id="decklist"
                    value={decklistText}
                    onChange={(e) => setDecklistText(e.target.value)}
                    className="bg-black/50 border-white/10 min-h-[150px]"
                    placeholder={"4 Lightning Bolt\n4 Goblin Guide"}
                  />
                </div>
                <Button onClick={handleCreateDeck} disabled={isCreating} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">
                  {isCreating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-xl bg-card/50 animate-pulse border border-border/50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {decks.map(deck => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={deck.id}
                onClick={() => router.push(`/decks/${deck.id}`)}
                className="group cursor-pointer relative"
              >
                <Card className="h-64 overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300">
                  <div className="absolute inset-0 z-0">
                    {deck.cover_url ? (
                      <>
                        <img src={deck.cover_url} className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-muted to-card opacity-50" />
                    )}
                  </div>
                  <CardContent className="relative z-10 h-full flex flex-col justify-end p-5">
                    <div className="flex justify-between items-start absolute top-4 right-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/50 hover:text-foreground hover:bg-background/50 backdrop-blur-md" onClick={e => e.stopPropagation()} />}>
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border text-foreground">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* TODO rename */ }}>
                            <Edit className="w-4 h-4 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* TODO duplicate */ }}>
                            <Copy className="w-4 h-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400 focus:text-red-300 focus:bg-red-950/50" onClick={(e) => handleDelete(deck.id, e)}>
                            <Trash className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{deck.name}</h3>
                      <p className="text-sm text-muted-foreground">{deck.format || 'No Format Specified'}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {decks.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl">
                <p className="text-muted-foreground mb-4">You don't have any decks yet.</p>
                <Button variant="outline" className="border-border text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => setIsDialogOpen(true)}>
                  Create your first deck
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
