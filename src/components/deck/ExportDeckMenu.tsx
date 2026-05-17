"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, ClipboardList, Copy, Download, FileText, BookOpen, Share2, Globe, Lock, Link as LinkIcon, Upload } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase/client"
import type { DeckCard } from "@/lib/types"
import {
  getZoneLabel,
  isMaybeboardZone,
  isSideboardZone,
  normalizeCardZone,
  zoneCountsTowardMainDeck,
} from "@/lib/zones"

interface Props {
  deckId: string
  deckName: string
  cards: DeckCard[]
  primerMarkdown: string
  commanderIds: string[]
  isPublic: boolean
  isOwner: boolean
  /** Appended to `/decks/[id]/registration` (e.g. `?version=…` when viewing a saved version). */
  registrationQuery?: string
  onVisibilityChange?: (isPublic: boolean) => void
  onImportClick?: () => void
}

function formatAsText(cards: DeckCard[], commanderIds: string[]): string {
  const isCommander = (c: DeckCard) => commanderIds.includes(c.scryfall_id)

  const commanders = cards.filter(isCommander)
  const main = cards.filter(c => !isCommander(c) && zoneCountsTowardMainDeck(c.zone))
  const side = cards.filter(c => isSideboardZone(c.zone))
  const maybe = cards.filter(c => isMaybeboardZone(c.zone))

  const customByZone = new Map<string, DeckCard[]>()
  for (const c of cards) {
    if (isCommander(c)) continue
    if (zoneCountsTowardMainDeck(c.zone)) continue
    if (isSideboardZone(c.zone)) continue
    if (isMaybeboardZone(c.zone)) continue
    const zid = normalizeCardZone(c.zone)
    const list = customByZone.get(zid)
    if (list) list.push(c)
    else customByZone.set(zid, [c])
  }

  const lines: string[] = []

  if (commanders.length > 0) {
    lines.push("// Commander")
    for (const c of commanders) lines.push(`${c.quantity} ${c.name}`)
    lines.push("")
  }

  lines.push("// Deck")
  for (const c of main) lines.push(`${c.quantity} ${c.name}`)

  if (side.length > 0) {
    lines.push("")
    lines.push("// Sideboard")
    for (const c of side) lines.push(`${c.quantity} ${c.name}`)
  }

  if (maybe.length > 0) {
    lines.push("")
    lines.push("// Maybeboard")
    for (const c of maybe) lines.push(`${c.quantity} ${c.name}`)
  }

  const customKeys = [...customByZone.keys()].sort((a, b) => getZoneLabel(a).localeCompare(getZoneLabel(b)))
  for (const zoneId of customKeys) {
    const list = customByZone.get(zoneId) ?? []
    if (list.length === 0) continue
    lines.push("")
    lines.push(`// ${getZoneLabel(zoneId)}`)
    for (const c of list) lines.push(`${c.quantity} ${c.name}`)
  }

  return lines.join("\n")
}

function formatForArena(cards: DeckCard[], commanderIds: string[]): string {
  const isCommander = (c: DeckCard) => commanderIds.includes(c.scryfall_id)

  const commanders = cards.filter(isCommander)
  const main = cards.filter(c => !isCommander(c) && zoneCountsTowardMainDeck(c.zone))
  const side = cards.filter(c => isSideboardZone(c.zone))
  const maybe = cards.filter(c => isMaybeboardZone(c.zone))

  const customByZone = new Map<string, DeckCard[]>()
  for (const c of cards) {
    if (isCommander(c)) continue
    if (zoneCountsTowardMainDeck(c.zone)) continue
    if (isSideboardZone(c.zone)) continue
    if (isMaybeboardZone(c.zone)) continue
    const zid = normalizeCardZone(c.zone)
    const list = customByZone.get(zid)
    if (list) list.push(c)
    else customByZone.set(zid, [c])
  }

  const cardLine = (c: DeckCard) => {
    const base = `${c.quantity} ${c.name}`
    if (c.set_code && c.collector_number) {
      return `${base} (${c.set_code.toUpperCase()}) ${c.collector_number}`
    }
    return base
  }

  const lines: string[] = []

  if (commanders.length > 0) {
    lines.push("Commander")
    for (const c of commanders) lines.push(cardLine(c))
    lines.push("")
  }

  lines.push("Deck")
  for (const c of main) lines.push(cardLine(c))

  if (side.length > 0) {
    lines.push("")
    lines.push("Sideboard")
    for (const c of side) lines.push(cardLine(c))
  }

  if (maybe.length > 0) {
    lines.push("")
    lines.push("Maybeboard")
    for (const c of maybe) lines.push(cardLine(c))
  }

  const customKeys = [...customByZone.keys()].sort((a, b) => getZoneLabel(a).localeCompare(getZoneLabel(b)))
  for (const zoneId of customKeys) {
    const list = customByZone.get(zoneId) ?? []
    if (list.length === 0) continue
    lines.push("")
    lines.push(getZoneLabel(zoneId))
    for (const c of list) lines.push(cardLine(c))
  }

  return lines.join("\n")
}

function downloadFile(filename: string, content: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportDeckMenu({
  deckId,
  deckName,
  cards,
  primerMarkdown,
  commanderIds,
  isPublic,
  isOwner,
  registrationQuery = "",
  onVisibilityChange,
  onImportClick,
}: Props) {
  const router = useRouter()
  const safeName = deckName.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  const registrationHref = `/decks/${deckId}/registration${registrationQuery}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      if (isPublic) {
        toast.success("Link copied to clipboard")
      } else {
        toast.success("Link copied", {
          description: "This deck is private — only you can open it.",
        })
      }
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const handleToggleVisibility = async () => {
    const next = !isPublic
    try {
      const { error } = await supabase
        .from("decks")
        .update({ is_public: next })
        .eq("id", deckId)
      if (error) {
        toast.error(error.message)
        return
      }
      onVisibilityChange?.(next)
      toast.success(next ? "Deck is now public" : "Deck is now private")
    } catch {
      toast.error("Failed to update visibility")
    }
  }

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(formatAsText(cards, commanderIds))
      toast.success("Decklist copied to clipboard")
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  const handleCopyArena = async () => {
    try {
      await navigator.clipboard.writeText(formatForArena(cards, commanderIds))
      toast.success("Arena list copied to clipboard")
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  const handleDownloadPrimer = () => {
    if (!primerMarkdown.trim()) {
      toast.error("No primer content to export")
      return
    }
    downloadFile(`${safeName}-primer.md`, primerMarkdown)
    toast.success("Primer downloaded")
  }

  const handleDownloadJson = () => {
    const data = JSON.stringify(
      {
        name: deckName,
        commanders: commanderIds,
        cards: cards.map(({ id, name, quantity, zone, tags, scryfall_id, printing_scryfall_id, finish, set_code, collector_number }) => ({
          id, name, quantity, zone, tags, scryfall_id, printing_scryfall_id, finish, set_code, collector_number,
        })),
      },
      null,
      2,
    )
    downloadFile(`${safeName}.json`, data, "application/json")
    toast.success("Deck exported as JSON")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Export and share"
        className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md bg-card border border-border px-2 text-sm font-medium text-foreground hover:bg-accent transition-colors sm:px-2.5"
      >
        <Share2 className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Export & Share</span>
        <ChevronDown className="hidden h-3 w-3 shrink-0 opacity-60 sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isOwner && onImportClick && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Import</DropdownMenuLabel>
              <DropdownMenuItem onClick={onImportClick}>
                <Upload className="w-4 h-4" />
                Import Decklist
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Share</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleCopyLink}>
            <LinkIcon className="w-4 h-4" />
            Copy Link
          </DropdownMenuItem>
          {isOwner && (
            <DropdownMenuItem onClick={handleToggleVisibility}>
              {isPublic ? (
                <>
                  <Lock className="w-4 h-4" />
                  Make Private
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Make Public
                </>
              )}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Decklist</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleCopyText}>
            <Copy className="w-4 h-4" />
            Copy as Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyArena}>
            <FileText className="w-4 h-4" />
            Copy for Arena
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(registrationHref)}>
            <ClipboardList className="w-4 h-4" />
            Registration view
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Primer</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleDownloadPrimer}>
            <BookOpen className="w-4 h-4" />
            Download Primer (.md)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Full Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleDownloadJson}>
            <Download className="w-4 h-4" />
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
