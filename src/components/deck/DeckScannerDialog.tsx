"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCcw, ScanLine } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase/client"
import { recordVersion } from "@/lib/versions"
import type { DeckCard } from "@/lib/types"

type HashBits = Uint8Array

type ReferenceCard = {
  key: string
  baseKey: string
  card: DeckCard
  fullHash: HashBits
  artHash: HashBits
  imageUrl: string
}

type ScanObservation = {
  key: string
  baseKey: string
  card: DeckCard
  quantity: number
  confidence: number
  score: number
  runnerUpScore: number | null
  evidenceUrl: string
}

type MatchResult = {
  reference: ReferenceCard
  confidence: number
  score: number
  runnerUpScore: number | null
}

type DiffRow = {
  key: string
  card: DeckCard
  currentQuantity: number
  scannedQuantity: number
  targetQuantity: number
  confidence: number | null
  status: "added" | "removed" | "changed" | "unchanged"
}

interface DeckScannerDialogProps {
  deckId: string
  cards: DeckCard[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied: () => void | Promise<void>
}

const HASH_WIDTH = 9
const HASH_HEIGHT = 8
const MATCH_THRESHOLD = 20
const GAP_THRESHOLD = 3

function primaryCardImage(card: DeckCard): string | undefined {
  return card.face_images?.[0]?.normal ?? card.face_images?.[0]?.small ?? card.image_url
}

function comparisonKey(card: Pick<DeckCard, "zone" | "oracle_id" | "scryfall_id" | "effective_printing_id" | "printing_scryfall_id" | "finish">): string {
  return [
    card.zone || "mainboard",
    card.oracle_id || card.scryfall_id,
    card.effective_printing_id || card.printing_scryfall_id || card.scryfall_id,
    card.finish || "nonfoil",
  ].join("|")
}

function baseKey(card: Pick<DeckCard, "zone" | "oracle_id" | "scryfall_id" | "name">): string {
  return [card.zone || "mainboard", card.oracle_id || card.scryfall_id, card.name].join("|")
}

function hammingDistance(a: HashBits, b: HashBits): number {
  let distance = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) distance++
  }
  return distance + Math.abs(a.length - b.length)
}

function getCenteredCardCrop(width: number, height: number) {
  const targetRatio = 5 / 7
  const cropHeight = Math.min(height * 0.86, width * 0.9 / targetRatio)
  const cropWidth = cropHeight * targetRatio
  return {
    sx: (width - cropWidth) / 2,
    sy: (height - cropHeight) / 2,
    sw: cropWidth,
    sh: cropHeight,
  }
}

function getArtCrop(width: number, height: number) {
  return {
    sx: width * 0.09,
    sy: height * 0.17,
    sw: width * 0.82,
    sh: height * 0.38,
  }
}

function computeDHash(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop?: { sx: number; sy: number; sw: number; sh: number }
): HashBits {
  const canvas = document.createElement("canvas")
  canvas.width = HASH_WIDTH
  canvas.height = HASH_HEIGHT
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return new Uint8Array(0)

  const region = crop ?? { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight }
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, HASH_WIDTH, HASH_HEIGHT)
  const pixels = ctx.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data
  const bits = new Uint8Array((HASH_WIDTH - 1) * HASH_HEIGHT)
  let bit = 0
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = (y * HASH_WIDTH + x) * 4
      const right = left + 4
      const leftLum = pixels[left] * 0.299 + pixels[left + 1] * 0.587 + pixels[left + 2] * 0.114
      const rightLum = pixels[right] * 0.299 + pixels[right + 1] * 0.587 + pixels[right + 2] * 0.114
      bits[bit++] = leftLum > rightLum ? 1 : 0
    }
  }
  return bits
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Image failed to load"))
    img.src = url
  })
}

function confidenceFromScores(score: number, runnerUpScore: number | null): number {
  const gap = runnerUpScore == null ? GAP_THRESHOLD : runnerUpScore - score
  const scoreComponent = Math.max(0, 1 - score / 32)
  const gapComponent = Math.max(0, Math.min(1, gap / 10))
  return Math.round((scoreComponent * 0.65 + gapComponent * 0.35) * 100)
}

function aggregateCurrent(cards: DeckCard[]): Map<string, { card: DeckCard; quantity: number; ids: string[] }> {
  const stacks = new Map<string, { card: DeckCard; quantity: number; ids: string[] }>()
  for (const card of cards) {
    const key = comparisonKey(card)
    const existing = stacks.get(key)
    if (existing) {
      existing.quantity += card.quantity
      existing.ids.push(card.id)
    } else {
      stacks.set(key, { card, quantity: card.quantity, ids: [card.id] })
    }
  }
  return stacks
}

function statusFor(currentQuantity: number, targetQuantity: number): DiffRow["status"] {
  if (currentQuantity === 0 && targetQuantity > 0) return "added"
  if (currentQuantity > 0 && targetQuantity === 0) return "removed"
  if (currentQuantity !== targetQuantity) return "changed"
  return "unchanged"
}

function statusClass(status: DiffRow["status"]) {
  if (status === "added") return "border-emerald-500/40 bg-emerald-500/10"
  if (status === "removed") return "border-red-500/40 bg-red-500/10"
  if (status === "changed") return "border-amber-500/40 bg-amber-500/10"
  return "border-border bg-card/50"
}

export function DeckScannerDialog({ deckId, cards, open, onOpenChange, onApplied }: DeckScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [references, setReferences] = useState<ReferenceCard[]>([])
  const [referencesLoading, setReferencesLoading] = useState(false)
  const [observations, setObservations] = useState<Map<string, ScanObservation>>(new Map())
  const [targetQuantities, setTargetQuantities] = useState<Record<string, number>>({})
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [applying, setApplying] = useState(false)

  const currentStacks = useMemo(() => aggregateCurrent(cards), [cards])
  const scanStarted = observations.size > 0 || Object.keys(targetQuantities).length > 0

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setCameraError(null)
      setLastMatch(null)
      return
    }

    let cancelled = false
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not available in this browser.")
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Camera permission was denied.")
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    async function buildReferences() {
      setReferencesLoading(true)
      const unique = new Map<string, DeckCard>()
      for (const card of cards) {
        const imageUrl = primaryCardImage(card)
        if (!imageUrl) continue
        const key = comparisonKey(card)
        if (!unique.has(key)) unique.set(key, card)
      }

      const built: ReferenceCard[] = []
      for (const card of unique.values()) {
        if (cancelled) return
        const imageUrl = primaryCardImage(card)
        if (!imageUrl) continue
        try {
          const img = await loadImage(imageUrl)
          const fullHash = computeDHash(img, img.naturalWidth, img.naturalHeight)
          const artHash = computeDHash(img, img.naturalWidth, img.naturalHeight, getArtCrop(img.naturalWidth, img.naturalHeight))
          built.push({
            key: comparisonKey(card),
            baseKey: baseKey(card),
            card,
            fullHash,
            artHash,
            imageUrl,
          })
        } catch {
          // A skipped reference only reduces scanner coverage; the review step remains editable.
        }
      }
      if (!cancelled) {
        setReferences(built)
        setReferencesLoading(false)
      }
    }

    void buildReferences()
    return () => {
      cancelled = true
    }
  }, [cards, open])

  const rows = useMemo<DiffRow[]>(() => {
    if (!scanStarted) return []
    const keys = new Set<string>([...currentStacks.keys(), ...observations.keys()])
    return Array.from(keys).map(key => {
      const current = currentStacks.get(key)
      const observed = observations.get(key)
      const card = observed?.card ?? current?.card
      const currentQuantity = current?.quantity ?? 0
      const scannedQuantity = observed?.quantity ?? 0
      const targetQuantity = targetQuantities[key] ?? scannedQuantity
      return {
        key,
        card: card!,
        currentQuantity,
        scannedQuantity,
        targetQuantity,
        confidence: observed?.confidence ?? null,
        status: statusFor(currentQuantity, targetQuantity),
      }
    }).filter(row => row.card).sort((a, b) => a.card.name.localeCompare(b.card.name))
  }, [currentStacks, observations, scanStarted, targetQuantities])

  const changedRows = rows.filter(row => row.status !== "unchanged")
  const observedCount = Array.from(observations.values()).reduce((sum, observation) => sum + observation.quantity, 0)

  function matchCanvas(canvas: HTMLCanvasElement): MatchResult | null {
    if (references.length === 0) return null
    const fullHash = computeDHash(canvas, canvas.width, canvas.height)
    const artHash = computeDHash(canvas, canvas.width, canvas.height, getArtCrop(canvas.width, canvas.height))
    const ranked = references
      .map(reference => {
        const full = hammingDistance(fullHash, reference.fullHash)
        const art = hammingDistance(artHash, reference.artHash)
        return { reference, score: full * 0.45 + art * 0.55 }
      })
      .sort((a, b) => a.score - b.score)

    const best = ranked[0]
    if (!best) return null
    const runnerUpScore = ranked[1]?.score ?? null
    const gap = runnerUpScore == null ? GAP_THRESHOLD : runnerUpScore - best.score
    if (best.score > MATCH_THRESHOLD || gap < GAP_THRESHOLD) {
      return null
    }
    return {
      reference: best.reference,
      confidence: confidenceFromScores(best.score, runnerUpScore),
      score: best.score,
      runnerUpScore,
    }
  }

  function captureCard() {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toast.error("Camera is not ready yet")
      return
    }
    if (referencesLoading || references.length === 0) {
      toast.error("Card references are still loading")
      return
    }

    setCapturing(true)
    try {
      const frameWidth = video.videoWidth
      const frameHeight = video.videoHeight
      const crop = getCenteredCardCrop(frameWidth, frameHeight)
      const canvas = document.createElement("canvas")
      canvas.width = 320
      canvas.height = 448
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Could not prepare scan canvas")
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)

      const match = matchCanvas(canvas)
      setLastMatch(match)
      if (!match) {
        toast.error("No confident deck match. Try brighter light and fill the guide with one card.")
        return
      }

      const evidenceUrl = canvas.toDataURL("image/jpeg", 0.75)
      const { reference } = match
      setObservations(prev => {
        const next = new Map(prev)
        const existing = next.get(reference.key)
        const quantity = (existing?.quantity ?? 0) + 1
        next.set(reference.key, {
          key: reference.key,
          baseKey: reference.baseKey,
          card: reference.card,
          quantity,
          confidence: Math.max(existing?.confidence ?? 0, match.confidence),
          score: match.score,
          runnerUpScore: match.runnerUpScore,
          evidenceUrl,
        })
        return next
      })
      setTargetQuantities(prev => ({
        ...prev,
        [reference.key]: (prev[reference.key] ?? observations.get(reference.key)?.quantity ?? 0) + 1,
      }))
      toast.success(`Scanned ${reference.card.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed")
    } finally {
      setCapturing(false)
    }
  }

  function resetScan() {
    setObservations(new Map())
    setTargetQuantities({})
    setLastMatch(null)
  }

  function keepUnseenCards() {
    const next: Record<string, number> = { ...targetQuantities }
    for (const [key, stack] of currentStacks) {
      if (!observations.has(key)) next[key] = stack.quantity
    }
    setTargetQuantities(next)
  }

  async function applyDiff() {
    setApplying(true)
    const versionSince = new Date().toISOString()
    try {
      for (const row of changedRows) {
        const current = currentStacks.get(row.key)
        if (current) {
          if (row.targetQuantity === 0) {
            for (const id of current.ids) {
              const { error } = await supabase.from("deck_cards").delete().eq("id", id)
              if (error) throw error
            }
          } else {
            const [primaryId, ...extraIds] = current.ids
            const { error } = await supabase.from("deck_cards").update({ quantity: row.targetQuantity }).eq("id", primaryId)
            if (error) throw error
            for (const extraId of extraIds) {
              const { error: deleteError } = await supabase.from("deck_cards").delete().eq("id", extraId)
              if (deleteError) throw deleteError
            }
          }
        } else if (row.targetQuantity > 0) {
          const { card } = row
          const { error } = await supabase.from("deck_cards").insert({
            deck_id: deckId,
            scryfall_id: card.scryfall_id,
            oracle_id: card.oracle_id,
            printing_scryfall_id: card.printing_scryfall_id ?? null,
            finish: card.finish ?? "nonfoil",
            name: card.name,
            quantity: row.targetQuantity,
          })
          if (error) throw error
        }
      }

      recordVersion(deckId, `Applied physical deck scan: ${changedRows.length} changed rows`, versionSince)
      toast.success("Scan diff applied")
      resetScan()
      await onApplied()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply scan diff")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-background/80" className="max-h-[90vh] overflow-y-auto border border-border bg-background text-foreground sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Scan physical deck
          </DialogTitle>
          <DialogDescription>
            Prototype scanner: align one physical card in the guide, capture it, then review the quantity diff against this digital deck.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <section className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-black">
              {cameraError ? (
                <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
                  <AlertTriangle className="h-8 w-8 text-amber-300" />
                  <div>{cameraError}</div>
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="aspect-[5/7] h-[86%] rounded-2xl border-2 border-primary/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
                      <div className="m-3 rounded-lg border border-dashed border-white/50 p-2 text-center text-[11px] font-medium uppercase tracking-wide text-white/80">
                        Fill guide with one card
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={captureCard} disabled={!!cameraError || referencesLoading || capturing}>
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Capture card
              </Button>
              <Button variant="outline" onClick={resetScan} disabled={observations.size === 0}>
                <RefreshCcw className="h-4 w-4" />
                Reset scan
              </Button>
              <Badge variant="outline" className="h-8">
                {referencesLoading ? "Building visual references..." : `${references.length} deck references`}
              </Badge>
              <Badge variant="outline" className="h-8">
                {observedCount} scanned
              </Badge>
            </div>
            {lastMatch && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Last match: {lastMatch.reference.card.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Confidence {lastMatch.confidence}% · visual score {lastMatch.score.toFixed(1)}
                  {lastMatch.runnerUpScore != null ? ` · runner-up ${lastMatch.runnerUpScore.toFixed(1)}` : ""}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Scan diff</div>
                <div className="text-xs text-muted-foreground">
                  {changedRows.length} changed rows. Unseen cards default to quantity 0 until edited or kept.
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={keepUnseenCards} disabled={cards.length === 0}>
                Keep unseen
              </Button>
            </div>

            <div className="max-h-[54vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-card/30 p-2">
              {rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Capture cards to build a physical-deck diff.
                </div>
              ) : (
                rows.map(row => {
                  const observation = observations.get(row.key)
                  return (
                    <div key={row.key} className={`rounded-lg border p-2 ${statusClass(row.status)}`}>
                      <div className="flex items-center gap-3">
                        {primaryCardImage(row.card) && (
                          <img src={primaryCardImage(row.card)} alt="" className="h-12 rounded border border-border/50" draggable={false} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{row.card.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
                              {row.status}
                            </Badge>
                            <span>digital {row.currentQuantity}</span>
                            <span>scanned {row.scannedQuantity}</span>
                            {row.confidence != null && <span>confidence {row.confidence}%</span>}
                          </div>
                        </div>
                        {observation?.evidenceUrl && (
                          <img src={observation.evidenceUrl} alt="" className="hidden h-12 rounded border border-border/50 sm:block" draggable={false} />
                        )}
                        <Input
                          aria-label={`Target quantity for ${row.card.name}`}
                          type="number"
                          min={0}
                          className="w-20 bg-background"
                          value={row.targetQuantity}
                          onChange={event => {
                            const value = Math.max(0, Number(event.target.value) || 0)
                            setTargetQuantities(prev => ({ ...prev, [row.key]: value }))
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
          <Button onClick={applyDiff} disabled={changedRows.length === 0 || applying}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Apply scan diff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
