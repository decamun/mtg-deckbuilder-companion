"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Plus, MoreVertical, Edit, Copy, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getCardsByIds, getCardsCollection, getCardBySetAndCN } from "@/lib/scryfall"
import { parseDecklist } from "@/lib/decklist-import"
import type { Deck } from "@/lib/types"
import Link from "next/link"

export function DecksSection() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [newDeckName, setNewDeckName] = useState("")
  const [newDeckFormat, setNewDeckFormat] = useState("edh")
  const [decklistText, setDecklistText] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const router = useRouter()

  useEffect(() => {
    fetchDecks()
  }, [])

  const fetchDecks = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setIsAuthenticated(false)
      setLoading(false)
      return
    }
    setIsAuthenticated(true)

    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load decks")
      return
    }

    const coverIds = data
      .map((d) => d.cover_image_scryfall_id)
      .filter(Boolean) as string[]
    const coverCards = await getCardsByIds(coverIds)
    const coverMap = new Map(coverCards.map((c) => [c.id, c]))
    const populatedDecks = data.map((deck) => ({
      ...deck,
      cover_url: coverMap.get(deck.cover_image_scryfall_id!)?.image_uris
        ?.normal,
    }))

    setDecks(populatedDecks)
    setLoading(false)
  }

  const handleCreateDeck = async () => {
    if (!newDeckName) return
    setIsCreating(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setIsCreating(false)
      return
    }

    const { data, error } = await supabase
      .from("decks")
      .insert({ name: newDeckName, user_id: user.id, format: newDeckFormat })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setIsCreating(false)
      return
    }

    if (decklistText.trim()) {
      const parsedCards = parseDecklist(decklistText)
      const uniqueNames = Array.from(new Set(parsedCards.map((p) => p.name)))
      const scryfallCards = await getCardsCollection(uniqueNames)

      // Resolve specific printings (set + CN) for any line that asked for one.
      const printingKeys = parsedCards
        .filter((p) => p.setCode && p.collectorNumber)
        .map((p) => `${p.setCode!.toLowerCase()}/${p.collectorNumber!}`)
      const uniquePrintingKeys = Array.from(new Set(printingKeys))
      const printingMap = new Map<string, { id: string; finishes?: string[] }>()
      await Promise.all(
        uniquePrintingKeys.map(async (k) => {
          const [s, cn] = k.split("/")
          const card = await getCardBySetAndCN(s, cn)
          if (card) printingMap.set(k, { id: card.id, finishes: card.finishes })
        })
      )

      let addedCount = 0
      const inserts: Array<{
        deck_id: string
        scryfall_id: string
        name: string
        quantity: number
        printing_scryfall_id: string | null
        finish: "nonfoil" | "foil" | "etched"
        oracle_id: string | null
      }> = []

      for (const parsed of parsedCards) {
        const scryfallCard = scryfallCards.find(
          (c) => c.name.toLowerCase() === parsed.name.toLowerCase()
        )
        if (!scryfallCard) {
          toast.error(`Could not find card: ${parsed.name}`)
          continue
        }
        let printingId: string | null = null
        let finishes: string[] | undefined
        if (parsed.setCode && parsed.collectorNumber) {
          const k = `${parsed.setCode.toLowerCase()}/${parsed.collectorNumber}`
          const hit = printingMap.get(k)
          if (hit) { printingId = hit.id; finishes = hit.finishes }
        }
        let finish: "nonfoil" | "foil" | "etched" = "nonfoil"
        if (parsed.foil) {
          if (!finishes || finishes.includes("foil")) finish = "foil"
          else toast.message(`${parsed.name}: foil not available for this printing — saved as non-foil`)
        }
        inserts.push({
          deck_id: data.id,
          scryfall_id: scryfallCard.id,
          printing_scryfall_id: printingId,
          finish,
          oracle_id: scryfallCard.oracle_id ?? null,
          name: scryfallCard.name,
          quantity: parsed.quantity,
        })
        addedCount++
      }

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from("deck_cards")
          .insert(inserts)
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
    setNewDeckFormat("edh")
    setDecklistText("")
    router.push(`/decks/${data.id}`)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const { error } = await supabase.from("decks").delete().eq("id", id)
    if (error) toast.error(error.message)
    else {
      toast.success("Deck deleted")
      setDecks(decks.filter((d) => d.id !== id))
    }
  }

  const openRenameDialog = (deck: Deck, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenameDeckId(deck.id)
    setRenameValue(deck.name)
  }

  const closeRenameDialog = () => {
    setRenameDeckId(null)
    setRenameValue("")
  }

  const handleRename = async () => {
    if (!renameDeckId) return
    const nextName = renameValue.trim()
    if (!nextName) return

    const { error } = await supabase
      .from("decks")
      .update({ name: nextName })
      .eq("id", renameDeckId)

    if (error) {
      toast.error(error.message)
      return
    }

    setDecks((current) =>
      current.map((deck) =>
        deck.id === renameDeckId ? { ...deck, name: nextName } : deck
      )
    )
    toast.success("Deck renamed")
    closeRenameDialog()
  }

  const handleDuplicate = async (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const original = decks.find((deck) => deck.id === deckId)
    if (!original) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error("Log in to duplicate decks")
      return
    }

    const { data: newDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        name: `${original.name} (Copy)`,
        user_id: user.id,
        format: original.format,
        commander_scryfall_ids: original.commander_scryfall_ids ?? [],
        cover_image_scryfall_id: original.cover_image_scryfall_id,
        description: original.description ?? null,
        is_public: false,
        primer_markdown: original.primer_markdown ?? "",
      })
      .select()
      .single()

    if (deckError) {
      toast.error(deckError.message)
      return
    }

    const { data: cards, error: cardsReadError } = await supabase
      .from("deck_cards")
      .select("scryfall_id, printing_scryfall_id, finish, oracle_id, name, quantity, zone, tags")
      .eq("deck_id", deckId)

    if (cardsReadError) {
      toast.error(`Deck copied, but cards could not be read: ${cardsReadError.message}`)
      await fetchDecks()
      return
    }

    if (cards?.length) {
      const inserts = cards.map((card) => ({
        ...card,
        deck_id: newDeck.id,
        printing_scryfall_id: card.printing_scryfall_id ?? null,
        finish: card.finish ?? "nonfoil",
        oracle_id: card.oracle_id ?? null,
        tags: card.tags ?? [],
      }))

      const { error: cardsError } = await supabase.from("deck_cards").insert(inserts)
      if (cardsError) {
        toast.error(`Deck copied, but cards could not be copied: ${cardsError.message}`)
        await fetchDecks()
        return
      }
    }

    toast.success(`"${original.name}" duplicated`)
    await fetchDecks()
  }

  if (isAuthenticated === false) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="font-heading text-3xl font-bold text-foreground">
          Your Decks
        </h2>
        <p className="text-muted-foreground">
          Log in to view and manage your decks.
        </p>
        <Link
          href="/login"
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Log In
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      <div className="mb-8 flex items-end justify-between">
        <div />
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" />
            }
          >
            <Plus className="mr-2 h-4 w-4" /> New Deck
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>Create New Deck</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="deck-name">Deck Name</Label>
                <Input
                  id="deck-name"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="bg-background/50 border-border"
                  placeholder="e.g. Modern Tron"
                />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={newDeckFormat}
                  onValueChange={(v) => v && setNewDeckFormat(v)}
                >
                  <SelectTrigger className="bg-background/50 border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="edh">EDH / Commander</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="pioneer">Pioneer</SelectItem>
                    <SelectItem value="legacy">Legacy</SelectItem>
                    <SelectItem value="vintage">Vintage</SelectItem>
                    <SelectItem value="pauper">Pauper</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="decklist">Decklist (Optional)</Label>
                <Textarea
                  id="decklist"
                  value={decklistText}
                  onChange={(e) => setDecklistText(e.target.value)}
                  className="bg-background/50 border-border min-h-[150px]"
                  placeholder={"4 Lightning Bolt\n4 Goblin Guide"}
                />
              </div>
              <Button
                onClick={handleCreateDeck}
                disabled={isCreating}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={!!renameDeckId}
        onOpenChange={(open) => {
          if (!open) closeRenameDialog()
        }}
      >
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Rename Deck</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename()
              }}
              className="bg-background/50 border-border"
              placeholder="Deck name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeRenameDialog}
              className="hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 rounded-xl bg-card/50 animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {decks.map((deck) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={deck.id}
              onClick={() => router.push(`/decks/${deck.id}`)}
              className="group relative cursor-pointer"
            >
              <Card className="h-64 overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300">
                <div className="absolute inset-0 z-0">
                  {deck.cover_url ? (
                    <>
                      <img
                        src={deck.cover_url}
                        className="h-full w-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                    </>
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-muted to-card opacity-50" />
                  )}
                </div>
                <CardContent className="relative z-10 flex h-full flex-col justify-end p-5">
                  <div className="absolute right-4 top-4 flex items-start justify-between">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-foreground/50 hover:text-foreground hover:bg-background/50 backdrop-blur-md"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-white border-border text-foreground"
                      >
                        <DropdownMenuItem
                          onClick={(e) => openRenameDialog(deck, e)}
                        >
                          <Edit className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDuplicate(deck.id, e)}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-300 focus:bg-red-950/50"
                          onClick={(e) => handleDelete(deck.id, e)}
                        >
                          <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                      {deck.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {deck.format || "No Format Specified"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {decks.length === 0 && (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-border py-20 text-center">
              <p className="mb-4 text-muted-foreground">
                You don&apos;t have any decks yet.
              </p>
              <Button
                variant="outline"
                className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setIsDialogOpen(true)}
              >
                Create your first deck
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
