"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Plus, MoreVertical, Edit, Copy, Trash, Link2 } from "lucide-react"
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
import { getCardsByIds, getCardImageUrl } from "@/lib/scryfall"
import { resolveDecklist } from "@/lib/decklist-import"
import { commanderIdsAndCoverFromResolvedCards } from "@/lib/deck-commander-meta"
import {
  getPrefetchedDeckCards,
  storePrefetchedDeckCards,
  warmScryfallForDeckRows,
  type DeckCardDbRow,
} from "@/lib/deck-prefetch-cache"
import type { Deck } from "@/lib/types"
import Link from "next/link"
import { EXTERNAL_DECK_PROVIDERS } from "@/lib/external-deck-providers"

export function DecksSection() {
  return <DecksSectionContent />
}

function DecksSectionContent() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [newDeckName, setNewDeckName] = useState("")
  const [newDeckFormat, setNewDeckFormat] = useState("edh")
  const [decklistText, setDecklistText] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [importStep, setImportStep] = useState<"url" | "confirm">("url")
  const [importDecklistText, setImportDecklistText] = useState("")
  const [importDeckName, setImportDeckName] = useState("")
  const [importDeckFormat, setImportDeckFormat] = useState("edh")
  const [importSourceLabel, setImportSourceLabel] = useState<string | null>(null)
  const [importSourceUrl, setImportSourceUrl] = useState("")
  const [importUrlError, setImportUrlError] = useState<string | null>(null)
  const [isImportFetching, setIsImportFetching] = useState(false)
  const [isImportCreating, setIsImportCreating] = useState(false)
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const router = useRouter()

  const supportedImportHosts = EXTERNAL_DECK_PROVIDERS.map((p) => p.label).join(", ")

  async function fetchDecks() {
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
      .select("id, name, format, budget_usd, bracket, cover_image_scryfall_id, commander_scryfall_ids, description, is_public, primer_markdown, user_id, created_at")
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
      cover_url: getCardImageUrl(coverMap.get(deck.cover_image_scryfall_id!)),
    }))

    setDecks(populatedDecks)
    setLoading(false)

    // Cap background prefetch: `fetchDecks` orders by `created_at` desc — warm only the five newest.
    const decksToPrefetch = populatedDecks.slice(0, 5)
    void Promise.all(
      decksToPrefetch.map((d) =>
        supabase
          .from("deck_cards")
          .select("*")
          .eq("deck_id", d.id)
          .then(({ data, error }) => {
            if (error || !data?.length) return
            storePrefetchedDeckCards(d.id, data as DeckCardDbRow[])
          })
      )
    )
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDecks()
    })
  }, [])

  async function persistNewDeckWithList(args: {
    name: string
    format: string
    listText: string
    description?: string | null
  }): Promise<{ ok: true; deckId: string } | { ok: false }> {
    const trimmedName = args.name.trim()
    if (!trimmedName) {
      toast.error("Deck name is required")
      return { ok: false }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error("Log in to create decks")
      return { ok: false }
    }

    let resolved: import("@/lib/decklist-import").ResolvedImportCard[] = []
    if (args.listText.trim()) {
      const { cards, warnings } = await resolveDecklist(args.listText)
      for (const w of warnings) toast.warning(w)
      resolved = cards
    }

    const { commander_scryfall_ids, cover_image_scryfall_id } =
      commanderIdsAndCoverFromResolvedCards(resolved)

    const { data, error } = await supabase
      .from("decks")
      .insert({
        name: trimmedName,
        user_id: user.id,
        format: args.format,
        commander_scryfall_ids,
        cover_image_scryfall_id,
        ...(args.description != null ? { description: args.description } : {}),
      })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return { ok: false }
    }

    if (resolved.length > 0) {
      const inserts = resolved.map((r) => ({
        deck_id: data.id,
        scryfall_id: r.scryfall_id,
        printing_scryfall_id: r.printing_scryfall_id,
        finish: r.finish,
        oracle_id: r.oracle_id,
        name: r.name,
        quantity: r.quantity,
        zone: r.zone,
        tags: [] as string[],
      }))

      const { error: insertError } = await supabase.from("deck_cards").insert(inserts)
      if (insertError) {
        toast.error(`Error saving cards: ${insertError.message}`)
      }
    }

    if (args.listText.trim()) {
      toast.success(`Deck created with ${resolved.length} unique cards!`)
    } else {
      toast.success("Deck created!")
    }

    return { ok: true, deckId: data.id }
  }

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return
    setIsCreating(true)
    try {
      const result = await persistNewDeckWithList({
        name: newDeckName,
        format: newDeckFormat,
        listText: decklistText,
      })
      if (result.ok) {
        setIsDialogOpen(false)
        setNewDeckName("")
        setNewDeckFormat("edh")
        setDecklistText("")
        router.push(`/decks/${result.deckId}`)
      }
    } finally {
      setIsCreating(false)
    }
  }

  const handleFetchDeckFromUrl = async () => {
    const trimmed = importUrl.trim()
    if (!trimmed) {
      setImportUrlError("Paste a deck URL")
      return
    }
    setImportUrlError(null)
    setIsImportFetching(true)
    try {
      const res = await fetch("/api/deck-import/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      const body = (await res.json()) as {
        message?: string
        deckName?: string | null
        decklistText?: string
        source?: string
      }
      if (!res.ok) {
        setImportUrlError(body.message ?? "Import failed")
        return
      }
      if (!body.decklistText?.trim()) {
        setImportUrlError("That link did not return a decklist")
        return
      }
      const label =
        EXTERNAL_DECK_PROVIDERS.find((p) => p.id === body.source)?.label ??
        body.source ??
        null
      setImportDecklistText(body.decklistText)
      setImportDeckName((body.deckName ?? "").trim() || "Imported deck")
      setImportSourceLabel(label)
      setImportSourceUrl(trimmed)
      setImportStep("confirm")
    } catch {
      setImportUrlError("Network error while fetching the deck")
    } finally {
      setIsImportFetching(false)
    }
  }

  const handleConfirmUrlImport = async () => {
    setIsImportCreating(true)
    try {
      const sourceUrl = importSourceUrl.trim() || importUrl.trim()
      const result = await persistNewDeckWithList({
        name: importDeckName,
        format: importDeckFormat,
        listText: importDecklistText,
        description: sourceUrl ? `Imported from ${sourceUrl}` : null,
      })
      if (result.ok) {
        setImportDialogOpen(false)
        setImportUrl("")
        setImportStep("url")
        setImportDecklistText("")
        setImportDeckName("")
        setImportDeckFormat("edh")
        setImportSourceLabel(null)
        setImportSourceUrl("")
        setImportUrlError(null)
        router.push(`/decks/${result.deckId}`)
      }
    } finally {
      setIsImportCreating(false)
    }
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

  const warmDeckNavigation = (deck: Deck) => {
    router.prefetch(`/decks/${deck.id}`)
    const warmCache = getPrefetchedDeckCards(deck.id, 120_000)
    if (warmCache?.length) {
      warmScryfallForDeckRows(deck, warmCache)
    }
    if (getPrefetchedDeckCards(deck.id, 30_000)?.length) {
      return
    }
    void (async () => {
      const { data, error } = await supabase
        .from("deck_cards")
        .select("*")
        .eq("deck_id", deck.id)
      if (error || !data?.length) return
      storePrefetchedDeckCards(deck.id, data as DeckCardDbRow[])
      warmScryfallForDeckRows(deck, data as DeckCardDbRow[])
    })()
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
      <div className="mb-8 flex flex-wrap items-center justify-end gap-2">
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
                    <SelectItem value="canlander">Canadian Highlander</SelectItem>
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

        <Dialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            setImportDialogOpen(open)
            if (open) {
              setImportStep("url")
              setImportUrl("")
              setImportDecklistText("")
              setImportDeckName("")
              setImportDeckFormat("edh")
              setImportSourceLabel(null)
              setImportSourceUrl("")
              setImportUrlError(null)
              setIsImportFetching(false)
              setIsImportCreating(false)
            } else {
              setImportUrlError(null)
              setIsImportFetching(false)
              setIsImportCreating(false)
            }
          }}
        >
          <DialogTrigger
            render={
              <Button
                variant="outline"
                className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
              />
            }
          >
            <Link2 className="mr-2 h-4 w-4" /> Import from URL
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import deck from URL</DialogTitle>
            </DialogHeader>

            {importStep === "url" ? (
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="import-deck-url">Deck link</Label>
                  <Input
                    id="import-deck-url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="bg-background/50 border-border"
                    placeholder="https://archidekt.com/decks/…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleFetchDeckFromUrl()
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported sources: {supportedImportHosts}.
                  </p>
                </div>
                {importUrlError ? (
                  <p className="text-sm text-red-400">{importUrlError}</p>
                ) : null}
                <Button
                  onClick={() => void handleFetchDeckFromUrl()}
                  disabled={isImportFetching || !importUrl.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isImportFetching ? "Fetching…" : "Continue"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                {importSourceLabel ? (
                  <p className="text-xs text-muted-foreground">Source: {importSourceLabel}</p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="import-deck-name">Deck name</Label>
                  <Input
                    id="import-deck-name"
                    value={importDeckName}
                    onChange={(e) => setImportDeckName(e.target.value)}
                    className="bg-background/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={importDeckFormat}
                    onValueChange={(v) => v && setImportDeckFormat(v)}
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
                      <SelectItem value="canlander">Canadian Highlander</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Decklist preview</Label>
                  <Textarea
                    readOnly
                    className="bg-background/50 border-border min-h-[140px] max-h-[40vh] resize-y font-mono text-xs"
                    value={importDecklistText}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-border"
                    onClick={() => {
                      setImportStep("url")
                      setImportUrlError(null)
                    }}
                    disabled={isImportCreating}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleConfirmUrlImport()}
                    disabled={isImportCreating || !importDeckName.trim()}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isImportCreating ? "Creating…" : "Create deck"}
                  </Button>
                </div>
              </div>
            )}
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
              onPointerEnter={() => warmDeckNavigation(deck)}
              onClick={() => router.push(`/decks/${deck.id}`)}
              className="group relative cursor-pointer"
            >
              <Card className="h-64 overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300">
                <div className="absolute inset-0 z-0">
                  {deck.cover_url ? (
                    <>
                      <img
                        src={deck.cover_url}
                        alt=""
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
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setIsDialogOpen(true)}
                >
                  Create your first deck
                </Button>
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setImportDialogOpen(true)}
                >
                  <Link2 className="mr-2 h-4 w-4" /> Import from URL
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
