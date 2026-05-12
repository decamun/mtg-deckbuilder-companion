"use client"

import { useState } from "react"
import { Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase/client"
import { getCardsByIds, getCardImageUrl, getCardFaceImages, cmcOf } from "@/lib/scryfall"
import { resolveDecklist } from "@/lib/decklist-import"
import { DeckDiffView } from "@/components/deck/DeckDiffView"
import { toast } from "sonner"
import { pickPrice } from "@/lib/format"
import type { DeckCard } from "@/lib/types"

interface Props {
  deckId: string
  currentCards: DeckCard[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

type Step = "input" | "processing" | "diff"

export function ImportDecklistDialog({
  deckId,
  currentCards,
  open,
  onOpenChange,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>("input")
  const [decklistText, setDecklistText] = useState("")
  const [preservePrintings, setPreservePrintings] = useState(true)
  const [proposedCards, setProposedCards] = useState<DeckCard[]>([])
  const [applying, setApplying] = useState(false)

  const resetAndClose = () => {
    if (applying) return
    onOpenChange(false)
    // Defer reset so the close animation isn't interrupted
    setTimeout(() => {
      setStep("input")
      setDecklistText("")
      setProposedCards([])
    }, 200)
  }

  const handleProcess = async () => {
    if (!decklistText.trim()) return
    setStep("processing")

    const { cards: resolved, warnings } = await resolveDecklist(decklistText, {
      preservePrintings,
      existingCards: currentCards,
    })

    for (const w of warnings) toast.warning(w)

    if (resolved.length === 0) {
      toast.error("No valid cards found in the decklist")
      setStep("input")
      return
    }

    // Hydrate with Scryfall data so the diff view has images, type lines, etc.
    const idsToFetch = new Set(resolved.map((c) => c.printing_scryfall_id || c.scryfall_id))
    const sfCards = await getCardsByIds(Array.from(idsToFetch))
    const sfMap = new Map(sfCards.map((c) => [c.id, c]))

    const hydrated: DeckCard[] = resolved.map((r, i) => {
      const effId = r.printing_scryfall_id || r.scryfall_id
      const effSf = sfMap.get(effId) ?? sfMap.get(r.scryfall_id)
      return {
        id: `import-preview-${i}`,
        deck_id: deckId,
        scryfall_id: r.scryfall_id,
        oracle_id: r.oracle_id,
        printing_scryfall_id: r.printing_scryfall_id,
        finish: r.finish,
        name: r.name,
        quantity: r.quantity,
        zone: r.zone,
        tags: [],
        image_url: getCardImageUrl(effSf),
        face_images: getCardFaceImages(effSf),
        type_line: effSf?.type_line ?? "",
        mana_cost: effSf?.mana_cost ?? "",
        cmc: cmcOf(effSf),
        colors: effSf?.colors ?? [],
        oracle_text: effSf?.oracle_text ?? "",
        produced_mana: effSf?.produced_mana ?? [],
        set_code: effSf?.set,
        collector_number: effSf?.collector_number,
        available_finishes: effSf?.finishes,
        price_usd: pickPrice(effSf?.prices, r.finish),
        rarity: effSf?.rarity,
        effective_printing_id: effId,
      }
    })

    setProposedCards(hydrated)
    setStep("diff")
  }

  const handleAccept = async () => {
    setApplying(true)

    // Preserve tags for cards that survive the import (matched by name)
    const tagsByName = new Map<string, string[]>()
    for (const c of currentCards) {
      if (c.tags?.length && !tagsByName.has(c.name.toLowerCase())) {
        tagsByName.set(c.name.toLowerCase(), c.tags)
      }
    }

    const { error: deleteError } = await supabase
      .from("deck_cards")
      .delete()
      .eq("deck_id", deckId)

    if (deleteError) {
      toast.error(`Failed to clear deck: ${deleteError.message}`)
      setApplying(false)
      return
    }

    const inserts = proposedCards.map((c) => ({
      deck_id: deckId,
      scryfall_id: c.scryfall_id,
      oracle_id: c.oracle_id,
      printing_scryfall_id: c.printing_scryfall_id,
      finish: c.finish,
      name: c.name,
      quantity: c.quantity,
      zone: c.zone,
      tags: tagsByName.get(c.name.toLowerCase()) ?? [],
    }))

    const { error: insertError } = await supabase.from("deck_cards").insert(inserts)

    if (insertError) {
      toast.error(`Failed to import cards: ${insertError.message}`)
      setApplying(false)
      return
    }

    toast.success(`Imported ${proposedCards.length} unique cards`)
    setApplying(false)
    resetAndClose()
    onImported()
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-background border border-border text-foreground sm:max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Decklist</DialogTitle>
          <DialogDescription>
            {step === "input" &&
              "Paste a decklist to import. You'll review changes before anything is applied."}
            {step === "processing" && "Processing decklist…"}
            {step === "diff" &&
              "Review the changes below. Cards not in the import will be removed from the deck."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="import-decklist">Decklist</Label>
                <Textarea
                  id="import-decklist"
                  value={decklistText}
                  onChange={(e) => setDecklistText(e.target.value)}
                  className="bg-background/50 border-border min-h-[200px] font-mono text-sm"
                  placeholder={"4 Lightning Bolt\n4 Goblin Guide\n// Sideboard\n2 Smash to Smithereens"}
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={preservePrintings}
                  onChange={(e) => setPreservePrintings(e.target.checked)}
                />
                <span className="text-sm">
                  Preserve printings
                  <span className="ml-2 text-xs text-muted-foreground">
                    {preservePrintings
                      ? "keeps existing card printings & finishes"
                      : "uses printings specified in the imported list"}
                  </span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={resetAndClose}
                className="hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={!decklistText.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Upload className="w-4 h-4 mr-2" />
                Preview Import
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "processing" && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "diff" && (
          <>
            <div className="py-2">
              <DeckDiffView
                before={{ label: "Current deck", cards: currentCards }}
                after={{ label: "Imported", cards: proposedCards }}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={resetAndClose}
                disabled={applying}
                className="hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("input")}
                disabled={applying}
              >
                Back
              </Button>
              <Button
                onClick={handleAccept}
                disabled={applying}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying…
                  </>
                ) : (
                  "Accept Import"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
