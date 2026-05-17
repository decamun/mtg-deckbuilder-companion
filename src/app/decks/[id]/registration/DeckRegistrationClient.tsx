"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Copy, Download, Printer } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase/client"
import type { Deck, DeckCard } from "@/lib/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatDeckRegistrationText } from "@/lib/deck-registration-format"
import { getVersion } from "@/lib/versions"
import { hydrateVersionSnapshot } from "../deck-workspace-version-hydrate"
import { useDeckWorkspaceFetch } from "../use-deck-workspace-fetch"

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type VersionOverlay = {
  cards: DeckCard[]
  commanderIds: string[]
  deckName: string
  format: string | null
}

export function DeckRegistrationClient({ deckId }: { deckId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const versionIdFromUrl = searchParams.get("version")

  const [accessDenied, setAccessDenied] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [commanderIds, setCommanderIds] = useState<string[]>([])
  const [, setCoverImageId] = useState<string | null>(null)
  const [, setPrimerMarkdown] = useState("")
  const [cards, setCards] = useState<DeckCard[]>([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [, setCoverImageUrl] = useState<string | null>(null)
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null)

  const [versionOverlay, setVersionOverlay] = useState<VersionOverlay | null>(null)
  const [versionState, setVersionState] = useState<"none" | "loading" | "ok" | "err">("none")

  const deckLoaded = !!deck

  useDeckWorkspaceFetch(deckId, {
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
    let cancelled = false
    void (async () => {
      if (!versionIdFromUrl) {
        if (!cancelled) {
          setVersionOverlay(null)
          setVersionState("none")
        }
        return
      }
      if (!deckLoaded) return
      if (!cancelled) setVersionState("loading")
      const row = await getVersion(versionIdFromUrl)
      if (cancelled) return
      if (!row || row.deck_id !== deckId) {
        setVersionState("err")
        setVersionOverlay(null)
        return
      }
      const hydrated = await hydrateVersionSnapshot(deckId, row)
      if (cancelled) return
      setVersionOverlay({
        cards: hydrated.cards,
        commanderIds: hydrated.deckMeta.commanders,
        deckName: hydrated.deckMeta.name,
        format: hydrated.deckMeta.format,
      })
      setVersionState("ok")
    })()
    return () => {
      cancelled = true
    }
  }, [versionIdFromUrl, deckId, deckLoaded])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!deck || !isOwner) {
        if (!cancelled) setOwnerDisplayName(null)
        return
      }
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      const meta = data.user?.user_metadata ?? {}
      const name =
        (typeof meta.display_name === "string" && meta.display_name.trim()) ||
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        null
      setOwnerDisplayName(name)
    })()
    return () => {
      cancelled = true
    }
  }, [deck, isOwner])

  const registration = useMemo(() => {
    if (!deck) return null
    if (versionIdFromUrl && versionState !== "ok") return null
    if (versionIdFromUrl && versionState === "ok" && !versionOverlay) return null
    const useSnap = !!versionIdFromUrl && versionOverlay
    return formatDeckRegistrationText({
      deckName: useSnap ? versionOverlay.deckName : deck.name,
      format: useSnap ? versionOverlay.format : deck.format,
      ownerDisplayName: ownerDisplayName ?? undefined,
      generatedAt: new Date(),
      cards: useSnap ? versionOverlay.cards : cards,
      commanderIds: useSnap ? versionOverlay.commanderIds : commanderIds,
    })
  }, [deck, cards, commanderIds, ownerDisplayName, versionIdFromUrl, versionState, versionOverlay])

  const displayTitle = versionOverlay && versionIdFromUrl ? versionOverlay.deckName : deck?.name ?? "deck"
  const displayFormat =
    versionOverlay && versionIdFromUrl ? versionOverlay.format : deck?.format ?? null

  const safeFilename = displayTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()

  const handleCopy = useCallback(async () => {
    if (!registration) return
    try {
      await navigator.clipboard.writeText(registration.text)
      toast.success("Registration list copied")
    } catch {
      toast.error("Failed to copy")
    }
  }, [registration])

  const handleDownload = useCallback(() => {
    if (!registration) return
    downloadFile(`${safeFilename}-registration.txt`, registration.text)
    toast.success("Downloaded registration list")
  }, [registration, safeFilename])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  if (accessDenied) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">Deck not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have access to this deck.</p>
        <Button variant="outline" className="mt-6" onClick={() => router.push("/decks")}>
          Back to decks
        </Button>
      </main>
    )
  }

  const awaitingVersion =
    !!versionIdFromUrl && !!deck && versionState !== "ok" && versionState !== "err"
  const versionFailed = !!versionIdFromUrl && !!deck && versionState === "err"

  if (versionFailed) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">Version not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This saved version could not be loaded, or it does not belong to this deck.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => router.push(`/decks/${deckId}`)}>
          Back to deck
        </Button>
      </main>
    )
  }

  if (cardsLoading || !deck || awaitingVersion || !registration) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading registration view…</p>
      </main>
    )
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  body * { visibility: hidden !important; }
  #deck-registration-root, #deck-registration-root * { visibility: visible !important; }
  #deck-registration-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    background: #fff !important;
    color: #000 !important;
    padding: 1rem !important;
  }
  #deck-registration-root .text-muted-foreground { color: #333 !important; }
  #deck-registration-root pre {
    border: 1px solid #ccc !important;
    background: #fafafa !important;
    color: #000 !important;
  }
}`,
        }}
      />
      <div id="deck-registration-root" className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
          <Link
            href={`/decks/${deckId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-1.5")}
          >
            <ArrowLeft className="size-4" />
            Back to deck
          </Link>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
              <Copy className="size-4" />
              Copy
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
              <Download className="size-4" />
              Download .txt
            </Button>
            <Button type="button" variant="default" size="sm" onClick={handlePrint}>
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        </div>

        <header className="mb-4 border-b border-border pb-4 print:border-black">
          <h1 className="text-xl font-bold tracking-tight text-foreground print:text-black">{displayTitle}</h1>
          {displayFormat ? (
            <p className="mt-1 text-sm text-muted-foreground print:text-neutral-700">Format: {displayFormat}</p>
          ) : null}
          {ownerDisplayName ? (
            <p className="text-sm text-muted-foreground print:text-neutral-700">Player: {ownerDisplayName}</p>
          ) : null}
          {versionIdFromUrl ? (
            <p className="mt-2 text-sm font-medium text-foreground print:text-black" role="status">
              Saved version — this list matches the snapshot, not necessarily the live deck.
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground print:text-neutral-600">
            Tournament-style list: commanders, main deck, and sideboard (alphabetical). Maybeboard and custom boards are
            not included.
          </p>
        </header>

        {registration.hasLinesWithoutPrintData ? (
          <p className="mb-3 text-sm text-amber-600 dark:text-amber-400 print:text-neutral-800" role="status">
            Some cards omit set and collector number because that data was not available.
          </p>
        ) : null}

        <section aria-labelledby="reg-list-heading">
          <h2 id="reg-list-heading" className="sr-only">
            Decklist text
          </h2>
          <pre
            className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-sm leading-relaxed text-foreground whitespace-pre-wrap print:border print:bg-neutral-50 print:text-black"
            tabIndex={0}
          >
            {registration.text}
          </pre>
        </section>
      </div>
    </>
  )
}
