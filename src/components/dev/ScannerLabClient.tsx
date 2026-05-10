"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  ImagePlus,
  Loader2,
  RefreshCcw,
  ScanLine,
  Wrench,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  applyPreferredAutofocus,
  describeCameraFocusCapabilities,
  nudgeAutofocusBeforeCapture,
  openCardCameraStream,
  readCameraFocusSetting,
} from "@/lib/camera-device"
import {
  DEFAULT_PHASH_PICK,
  type PhashPickResult,
  type PhashRankedMatch,
  type PhashScannerReference,
  buildPhashScannerReference,
  computeDctPhash256FromCanvas,
  pickPhashMatch,
  rankPhashMatches,
} from "@/lib/deck-scanner-phash"
import { buildRgbScannerReference, hammingPacked256 } from "@/lib/deck-scanner-rgb"
import { analyzeEdgeRefinementDebug, refineCardCanvasByEdges, type EdgeRefinementDebug } from "@/lib/deck-scanner-card-refine"
import {
  getArtCrop,
  getCenteredCardCrop,
  getCenteredCardCropPercents,
  captureRawSlotFromImageElement,
  captureRawSlotFromVideo,
} from "@/lib/deck-scanner-visual"
import { getCardImageUrl, getCardsByIds, getCardsCollection, type ScryfallCard } from "@/lib/scryfall"
import { loadUserDeckScryfallPrintings } from "@/lib/scanner-deck-load"
import { formatUnknownScannerError, runCardOcrFuzzySearch, type OcrSearchHit } from "@/lib/scanner-ocr-search"
import { supabase } from "@/lib/supabase/client"

type LogEntry = { at: string; level: "info" | "warn" | "error"; message: string }

type ReferenceRow =
  | { status: "ok"; ref: PhashScannerReference }
  | { status: "error"; id: string; name: string; imageUrl?: string; message: string }

const DEMO_NAMES = ["Lightning Bolt", "Giant Growth", "Dark Ritual", "Counterspell", "Serra Angel"] as const

const DEFAULT_ID_LIST = [
  "a7d62dba-7394-4d42-8ee8-4af503a552f5",
  "9d1d4f93-f079-41db-9543-4428d04d8286",
].join("\n")

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

function searchTextFromScryfall(card: ScryfallCard): string {
  return [card.name, card.type_line, card.oracle_text]
    .filter(s => s && String(s).trim())
    .join("\n")
    .slice(0, 8000)
}

export function ScannerLabClient() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanRafRef = useRef<number | null>(null)

  const [log, setLog] = useState<LogEntry[]>([])
  const pushLog = useCallback((level: LogEntry["level"], message: string) => {
    const at = new Date().toISOString()
    setLog(prev => [...prev.slice(-200), { at, level, message }])
  }, [])

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [idsInput, setIdsInput] = useState(DEFAULT_ID_LIST)
  const [namesInput, setNamesInput] = useState(DEMO_NAMES.join("\n"))
  const [deckNameInput, setDeckNameInput] = useState("")
  const [referenceRows, setReferenceRows] = useState<ReferenceRow[]>([])
  const [referencesLoading, setReferencesLoading] = useState(false)

  const [phashDistanceMax, setPhashDistanceMax] = useState(DEFAULT_PHASH_PICK.distanceMax)
  const [phashGapMin, setPhashGapMin] = useState(DEFAULT_PHASH_PICK.gapMin)
  const [scanStopDistanceMax, setScanStopDistanceMax] = useState(44)
  const [scanStopGapMin, setScanStopGapMin] = useState(8)
  const [continuousScanning, setContinuousScanning] = useState(false)

  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null)
  const [lastCropMeta, setLastCropMeta] = useState<{
    sourceLabel: string
    frameW: number
    frameH: number
    outW: number
    outH: number
  } | null>(null)
  const [lastHashInfo, setLastHashInfo] = useState<{ phashBytes: number } | null>(null)
  const [lastRanked, setLastRanked] = useState<PhashRankedMatch[]>([])
  const [lastPick, setLastPick] = useState<PhashPickResult | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [refineDebug, setRefineDebug] = useState<EdgeRefinementDebug | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrRaw, setOcrRaw] = useState("")
  const [ocrQuery, setOcrQuery] = useState("")
  const [ocrHits, setOcrHits] = useState<OcrSearchHit[]>([])
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null)
  const [cameraFocusDebug, setCameraFocusDebug] = useState<string | null>(null)

  const okPhashRefs = useMemo(
    () => referenceRows.filter((r): r is Extract<ReferenceRow, { status: "ok" }> => r.status === "ok").map(r => r.ref),
    [referenceRows]
  )

  const onVideoFrameInfo = useCallback((video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoDims({ w: video.videoWidth, h: video.videoHeight })
    }
  }, [])

  const secureContext = typeof window !== "undefined" && window.isSecureContext
  const hasGetUserMedia = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      if (!hasGetUserMedia || !secureContext) {
        setCameraError(
          !secureContext
            ? "Camera needs a secure context (https or localhost)."
            : "getUserMedia is not available in this browser."
        )
        return
      }
      try {
        const stream = await openCardCameraStream()
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        const applied = await applyPreferredAutofocus(stream)
        const caps = describeCameraFocusCapabilities(stream)
        const current = readCameraFocusSetting(stream)
        if (!cancelled) {
          setCameraFocusDebug(`apply: ${applied} · modes: ${caps} · setting: ${current}`)
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          onVideoFrameInfo(videoRef.current)
        }
        setCameraError(null)
        pushLog("info", `Camera started · autofocus ${applied} (focusMode setting: ${current})`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setCameraError(msg)
        pushLog("error", `Camera: ${msg}`)
      }
    }
    void startCamera()
    return () => {
      cancelled = true
      setCameraFocusDebug(null)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [hasGetUserMedia, onVideoFrameInfo, pushLog, secureContext])

  const buildFromCards = useCallback(
    async (label: string, cards: ScryfallCard[]) => {
      setReferencesLoading(true)
      setLastRanked([])
      setLastPick(null)
      setLastPreviewUrl(null)
      setLastCropMeta(null)
      setLastHashInfo(null)
      setRefineDebug(null)
      setOcrRaw("")
      setOcrQuery("")
      setOcrHits([])
      const rows: ReferenceRow[] = []
      pushLog("info", `${label}: loading ${cards.length} printings…`)
      const builtByImageUrl = new Map<string, PhashScannerReference>()
      for (const card of cards) {
        const imageUrl = getCardImageUrl(card, "normal")
        const id = card.id
        const name = card.name
        if (!imageUrl) {
          rows.push({ status: "error", id, name, message: "No image_uris on this card (token?)" })
          continue
        }
        const cached = builtByImageUrl.get(imageUrl)
        if (cached) {
          rows.push({
            status: "ok",
            ref: {
              ...cached,
              id,
              name,
              packed: new Uint8Array(cached.packed),
              searchText: searchTextFromScryfall(card),
            },
          })
          pushLog("info", `Reference OK (shared art): ${name}`)
          continue
        }
        try {
          const ref = await buildPhashScannerReference(id, name, imageUrl, {
            typeLine: card.type_line,
            oracleText: card.oracle_text,
          })
          builtByImageUrl.set(imageUrl, ref)
          rows.push({ status: "ok", ref })
          pushLog("info", `Reference OK: ${name} (${ref.imageWidth}×${ref.imageHeight}) · DCT pHash 256-bit`)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          rows.push({ status: "error", id, name, imageUrl, message })
          pushLog("warn", `Reference failed: ${name} — ${message} (throttle/CORS/offline?)`)
        }
      }
      setReferenceRows(rows)
      setReferencesLoading(false)
      const ok = rows.filter(r => r.status === "ok").length
      pushLog("info", `${label}: done — ${ok}/${rows.length} references with usable hashes.`)
    },
    [pushLog]
  )

  const loadDemoByName = useCallback(async () => {
    const lines = namesInput
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      pushLog("warn", "No card names in the text area.")
      return
    }
    const cards = await getCardsCollection(lines)
    if (cards.length === 0) {
      pushLog("error", "Scryfall returned no cards for those names.")
      return
    }
    await buildFromCards("Named demo", cards)
  }, [buildFromCards, namesInput, pushLog])

  const loadByIds = useCallback(async () => {
    const ids = idsInput
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)
    if (ids.length === 0) {
      pushLog("warn", "No Scryfall IDs in the text area.")
      return
    }
    const cards = await getCardsByIds(ids)
    if (cards.length === 0) {
      pushLog("error", "Scryfall returned no cards for those IDs.")
      return
    }
    await buildFromCards("IDs", cards)
  }, [buildFromCards, idsInput, pushLog])

  const loadMyDeckByName = useCallback(async () => {
    const name = deckNameInput.trim()
    if (!name) {
      pushLog("warn", "Enter your deck name.")
      return
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        pushLog("error", "Log in to load a deck from Your Decks.")
        return
      }
      const { deckName, cards, rowCount } = await loadUserDeckScryfallPrintings(supabase, user.id, name)
      pushLog(
        "info",
        `Resolved deck "${deckName}": ${cards.length} unique printings (${rowCount} deck rows). Building references with paced image loads…`
      )
      await buildFromCards(`Deck: ${deckName}`, cards)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushLog("error", msg)
    }
  }, [buildFromCards, deckNameInput, pushLog])

  const runAnalysis = useCallback(
    (
      refinedCanvas: HTMLCanvasElement,
      sourceLabel: string,
      frameW: number,
      frameH: number,
      rawSlot?: HTMLCanvasElement | null
    ) => {
      if (rawSlot) {
        setRefineDebug(analyzeEdgeRefinementDebug(rawSlot))
      } else {
        setRefineDebug(null)
      }
      const preview = refinedCanvas.toDataURL("image/jpeg", 0.85)
      setLastPreviewUrl(preview)
      setLastCropMeta({
        sourceLabel,
        frameW,
        frameH,
        outW: refinedCanvas.width,
        outH: refinedCanvas.height,
      })
      const packed = computeDctPhash256FromCanvas(refinedCanvas)
      setLastHashInfo({ phashBytes: packed.byteLength })

      const ranked = rankPhashMatches(packed, okPhashRefs)
      setLastRanked(ranked)
      const pick = pickPhashMatch(ranked, { distanceMax: phashDistanceMax, gapMin: phashGapMin })
      setLastPick(pick)

      if (pick.match) {
        pushLog("info", `Match: ${pick.match.reference.name} · pHash distance ${pick.match.distance}`)
      } else {
        pushLog("warn", `No pick: ${pick.rejectReason ?? "unknown"}`)
      }
    },
    [okPhashRefs, phashDistanceMax, phashGapMin, pushLog]
  )

  const captureFromVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video) {
      pushLog("error", "Video element missing.")
      return
    }
    if (referencesLoading || okPhashRefs.length === 0) {
      pushLog("warn", "Build references first.")
      return
    }
    setCapturing(true)
    try {
      const stream = streamRef.current
      if (stream) {
        await nudgeAutofocusBeforeCapture(stream)
        await new Promise(r => setTimeout(r, 260))
      }
      const raw = captureRawSlotFromVideo(video)
      if (!raw) {
        pushLog("error", "Video not ready (dimensions or readyState).")
        return
      }
      const refined = refineCardCanvasByEdges(raw)
      runAnalysis(refined, "live camera", video.videoWidth, video.videoHeight, raw)
    } finally {
      setCapturing(false)
    }
  }, [okPhashRefs.length, pushLog, referencesLoading, runAnalysis])

  const onPickFile = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return
      if (referencesLoading || okPhashRefs.length === 0) {
        pushLog("warn", "Build references first.")
        return
      }
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const raw = captureRawSlotFromImageElement(img)
          const refined = refineCardCanvasByEdges(raw)
          runAnalysis(refined, `file: ${file.name}`, img.naturalWidth, img.naturalHeight, raw)
        } catch (e) {
          pushLog("error", e instanceof Error ? e.message : String(e))
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        pushLog("error", `Could not decode image file: ${file.name}`)
      }
      img.src = url
    },
    [okPhashRefs.length, pushLog, referencesLoading, runAnalysis]
  )

  useEffect(() => {
    if (!continuousScanning || cameraError || okPhashRefs.length === 0) {
      if (scanRafRef.current != null) {
        cancelAnimationFrame(scanRafRef.current)
        scanRafRef.current = null
      }
      return
    }

    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        scanRafRef.current = requestAnimationFrame(tick)
        return
      }
      const raw = captureRawSlotFromVideo(video)
      if (raw) {
        const refined = refineCardCanvasByEdges(raw)
        const packed = computeDctPhash256FromCanvas(refined)
        const ranked = rankPhashMatches(packed, okPhashRefs)
        const best = ranked[0]
        const second = ranked[1]
        const gap = second ? second.distance - best.distance : scanStopGapMin
        if (
          best &&
          best.distance <= scanStopDistanceMax &&
          gap >= scanStopGapMin &&
          (second != null || okPhashRefs.length === 1)
        ) {
          if (scanRafRef.current != null) {
            cancelAnimationFrame(scanRafRef.current)
            scanRafRef.current = null
          }
          setContinuousScanning(false)
          runAnalysis(refined, "live camera (continuous hit)", video.videoWidth, video.videoHeight, raw)
          queueMicrotask(() => {
            window.confirm(
              [
                "Continuous scan: threshold reached.",
                `Best match: ${best.reference.name}`,
                `pHash distance ${best.distance}`,
                `Gap to second ${gap.toFixed(1)}`,
                "",
                "Scanning has stopped. Last frame is shown in Last crop / ranking.",
              ].join("\n")
            )
          })
          return
        }
      }
      scanRafRef.current = requestAnimationFrame(tick)
    }

    scanRafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (scanRafRef.current != null) {
        cancelAnimationFrame(scanRafRef.current)
        scanRafRef.current = null
      }
    }
  }, [cameraError, continuousScanning, okPhashRefs, runAnalysis, scanStopDistanceMax, scanStopGapMin])

  const rankedStats = useMemo(() => {
    const scores = lastRanked.map(r => r.distance)
    return {
      count: scores.length,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      median: median(scores),
    }
  }, [lastRanked])

  const runOcrOnLastCapture = useCallback(async () => {
    if (!lastPreviewUrl || okPhashRefs.length === 0) {
      pushLog("warn", "Capture a frame first, and load references.")
      return
    }
    setOcrLoading(true)
    try {
      const pool = okPhashRefs.map(r => ({ id: r.id, name: r.name, searchText: r.searchText }))
      const { rawText, query, hits } = await runCardOcrFuzzySearch(lastPreviewUrl, pool)
      setOcrRaw(rawText)
      setOcrQuery(query)
      setOcrHits(hits)
      pushLog("info", `OCR + fuzzy search: ${hits.length} hits (Tesseract first run may download language data).`)
    } catch (e) {
      const msg = e instanceof Error ? e.message || e.name : formatUnknownScannerError(e)
      pushLog("error", `OCR failed: ${msg}`)
    } finally {
      setOcrLoading(false)
    }
  }, [lastPreviewUrl, okPhashRefs, pushLog])

  const cropGuide = videoDims ? getCenteredCardCrop(videoDims.w, videoDims.h) : null
  const aimOverlayPercents = useMemo(() => {
    if (!videoDims) return null
    return getCenteredCardCropPercents(videoDims.w, videoDims.h)
  }, [videoDims])
  const artOnPreview =
    lastCropMeta && lastPreviewUrl
      ? getArtCrop(lastCropMeta.outW, lastCropMeta.outH)
      : null

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-16 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scanner lab</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Debugger for the physical deck scanner: <strong className="font-normal">DCT pHash</strong> (256-bit on a 64×64 grayscale crop of the 320×448 card), optional <strong className="font-normal">RGB dHash</strong> diagnostics in{" "}
          <code className="text-[11px]">deck-scanner-rgb.ts</code>, edge-refinement previews, OCR + fuzzy text search over the loaded pool, continuous scanning, and references from Scryfall or your decks.
        </p>
        <p className="max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-medium">Geometry:</strong> after the centered 5:7 slot, frames are passed through a <strong className="font-normal">texture high-pass + Sobel edge bounding box</strong> (with 5:7 clamp) when signal is strong enough; otherwise the slot crop is kept. This targets playmat gradients and loose framing before pHash/RGB.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4" />
              Environment
            </CardTitle>
            <CardDescription>Runtime facts that often explain “nothing matches”.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            <div>
              <span className="text-muted-foreground">secure context:</span> {String(secureContext)}
            </div>
            <div>
              <span className="text-muted-foreground">getUserMedia:</span> {String(hasGetUserMedia)}
            </div>
            <div>
              <span className="text-muted-foreground">userAgent:</span> {typeof navigator !== "undefined" ? navigator.userAgent : "—"}
            </div>
            {videoDims && (
              <div>
                <span className="text-muted-foreground">video frame:</span> {videoDims.w}×{videoDims.h}
              </div>
            )}
            {cropGuide && (
              <div className="text-muted-foreground">
                centered card crop (normalized): sx {cropGuide.sx.toFixed(0)} sy {cropGuide.sy.toFixed(0)} sw{" "}
                {cropGuide.sw.toFixed(0)} sh {cropGuide.sh.toFixed(0)}
              </div>
            )}
            {cameraFocusDebug && (
              <div className="text-muted-foreground">
                <span className="text-foreground">camera focus:</span> {cameraFocusDebug}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">pHash match &amp; continuous scan</CardTitle>
            <CardDescription>
              Primary matcher is grayscale DCT pHash (hash size 16, ImageHash-style sizing). Lower Hamming distance is better. Pick defaults: distance ≤ {DEFAULT_PHASH_PICK.distanceMax}, gap ≥ {DEFAULT_PHASH_PICK.gapMin}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ph-dmax">Pick: max pHash distance (8–96)</Label>
                <Badge variant="outline">{phashDistanceMax}</Badge>
              </div>
              <input
                id="ph-dmax"
                type="range"
                min={8}
                max={96}
                step={1}
                value={phashDistanceMax}
                onChange={e => setPhashDistanceMax(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ph-gap">Pick: min gap (1st vs 2nd distance)</Label>
                <Badge variant="outline">{phashGapMin}</Badge>
              </div>
              <input
                id="ph-gap"
                type="range"
                min={0}
                max={24}
                step={0.5}
                value={phashGapMin}
                onChange={e => setPhashGapMin(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="scan-dmax">Continuous stop: max distance</Label>
                <Badge variant="outline">{scanStopDistanceMax}</Badge>
              </div>
              <input
                id="scan-dmax"
                type="range"
                min={8}
                max={96}
                step={1}
                value={scanStopDistanceMax}
                onChange={e => setScanStopDistanceMax(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="scan-gap">Continuous stop: min distance gap (1st vs 2nd)</Label>
                <Badge variant="outline">{scanStopGapMin}</Badge>
              </div>
              <input
                id="scan-gap"
                type="range"
                min={0}
                max={32}
                step={0.5}
                value={scanStopGapMin}
                onChange={e => setScanStopGapMin(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reference library</CardTitle>
            <CardDescription>
              References must load with <code className="text-xs">crossOrigin=&quot;anonymous&quot;</code> so pixels are readable. Failed rows usually mean CORS, offline, or missing art.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Demo card names (one per line)</Label>
              <Textarea value={namesInput} onChange={e => setNamesInput(e.target.value)} rows={5} className="font-mono text-xs" />
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadDemoByName()} disabled={referencesLoading}>
                {referencesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load names via Scryfall
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Scryfall card IDs (UUID per line or comma-separated)</Label>
              <Textarea value={idsInput} onChange={e => setIdsInput(e.target.value)} rows={4} className="font-mono text-xs" />
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadByIds()} disabled={referencesLoading}>
                Load IDs via Scryfall
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Your deck (exact or partial name)</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={deckNameInput}
                  onChange={e => setDeckNameInput(e.target.value)}
                  placeholder="e.g. My Commander Deck"
                  className="min-w-[200px] flex-1 font-mono text-sm"
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadMyDeckByName()} disabled={referencesLoading}>
                  Load my deck
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">Reference rows ({referenceRows.length})</div>
              <div className="max-h-[320px] overflow-y-auto">
                {referenceRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No references yet.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {referenceRows.map(row => {
                      if (row.status === "error") {
                        return (
                          <li key={row.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{row.name}</div>
                              <div className="break-all font-mono text-xs text-muted-foreground">{row.id}</div>
                              <div className="mt-1 text-xs text-destructive">{row.message}</div>
                              {row.imageUrl && (
                                <a href={row.imageUrl} className="mt-1 inline-block text-xs text-primary underline" target="_blank" rel="noreferrer">
                                  Open image URL
                                </a>
                              )}
                            </div>
                          </li>
                        )
                      }
                      const { ref } = row
                      return (
                        <li key={ref.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                          <img
                            src={ref.imageUrl}
                            alt=""
                            className="h-14 w-auto rounded border border-border"
                            width={ref.imageWidth}
                            height={ref.imageHeight}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{ref.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {ref.imageWidth}×{ref.imageHeight} · DCT pHash 256-bit ({ref.packed.length} bytes)
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              Capture
            </CardTitle>
            <CardDescription>Align a card like the deck dialog, then capture — or feed a still photo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="relative w-full overflow-hidden rounded-xl border border-border bg-black"
              style={{
                aspectRatio: videoDims ? `${videoDims.w} / ${videoDims.h}` : "3 / 4",
              }}
            >
              {cameraError ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
                  <AlertTriangle className="h-8 w-8 text-amber-300" />
                  {cameraError}
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="block h-full w-full object-contain"
                    playsInline
                    muted
                    onLoadedMetadata={e => onVideoFrameInfo(e.currentTarget)}
                    onResize={e => onVideoFrameInfo(e.currentTarget)}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    {aimOverlayPercents && (
                      <div
                        className="absolute rounded-2xl border-2 border-primary/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
                        style={{
                          left: `${aimOverlayPercents.left}%`,
                          top: `${aimOverlayPercents.top}%`,
                          width: `${aimOverlayPercents.width}%`,
                          height: `${aimOverlayPercents.height}%`,
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={captureFromVideo} disabled={!!cameraError || referencesLoading || capturing || continuousScanning}>
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Capture from camera
              </Button>
              <Button
                type="button"
                variant={continuousScanning ? "destructive" : "secondary"}
                onClick={() => {
                  if (continuousScanning) {
                    setContinuousScanning(false)
                    pushLog("info", "Continuous scan stopped manually.")
                  } else {
                    if (cameraError || okPhashRefs.length === 0) {
                      pushLog("warn", "Need camera and references to start continuous scan.")
                      return
                    }
                    setContinuousScanning(true)
                    pushLog("info", "Continuous scan started (uses thresholds in the right-hand card).")
                  }
                }}
                disabled={
                  referencesLoading ||
                  (!continuousScanning && (!!cameraError || okPhashRefs.length === 0))
                }
              >
                {continuousScanning ? "Stop continuous scan" : "Start continuous scan"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={referencesLoading}
              >
                <ImagePlus className="h-4 w-4" />
                Analyze image file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  onPickFile(e.target.files)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLastRanked([])
                  setLastPick(null)
                  setLastPreviewUrl(null)
                  setLastCropMeta(null)
                  setLastHashInfo(null)
                  setRefineDebug(null)
                  setOcrRaw("")
                  setOcrQuery("")
                  setOcrHits([])
                  pushLog("info", "Cleared last capture analytics.")
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                Clear capture
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Output canvas is 320×448. pHash resizes luminance to 64×64, 2D DCT, then 16×16 low-frequency median hash (256 bits, 32 bytes).
            </p>
          </CardContent>
        </Card>
      </div>

      {(lastPreviewUrl || lastRanked.length > 0) && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last crop</CardTitle>
              {lastCropMeta && (
                <CardDescription>
                  {lastCropMeta.sourceLabel} · source {lastCropMeta.frameW}×{lastCropMeta.frameH} → {lastCropMeta.outW}×
                  {lastCropMeta.outH}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {lastPreviewUrl && (
                <div className="space-y-2">
                  <div className="relative inline-block max-w-full overflow-hidden rounded-lg border border-border">
                    <img src={lastPreviewUrl} alt="Last capture" className="block max-h-[360px] w-auto" />
                    {artOnPreview && lastCropMeta && (
                      <div
                        className="pointer-events-none absolute border-2 border-cyan-400/90 bg-cyan-400/10"
                        style={{
                          left: `${(artOnPreview.sx / lastCropMeta.outW) * 100}%`,
                          top: `${(artOnPreview.sy / lastCropMeta.outH) * 100}%`,
                          width: `${(artOnPreview.sw / lastCropMeta.outW) * 100}%`,
                          height: `${(artOnPreview.sh / lastCropMeta.outH) * 100}%`,
                        }}
                        title="Art crop used for artHash (inner band on the card)"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Orange guide matches this crop. Cyan shows the inner art rectangle (legacy dHash art band — not used by pHash).
                  </p>
                </div>
              )}
              {lastHashInfo && (
                <div className="font-mono text-xs text-muted-foreground">
                  pHash packed bytes: {lastHashInfo.phashBytes}
                </div>
              )}
              {lastPick && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">Pick result</div>
                  {lastPick.match ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      <li>Winner: {lastPick.match.reference.name}</li>
                      <li>pHash distance {lastPick.match.distance}</li>
                      {lastPick.runnerUp && (
                        <li>
                          Runner-up: {lastPick.runnerUp.reference.name} · distance {lastPick.runnerUp.distance}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{lastPick.rejectReason}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Full ranking</CardTitle>
              <CardDescription>
                Sorted by pHash distance (lower is better). Green: accepted pick; amber: tight gap; red: over pick distance max.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>n={rankedStats.count}</span>
                {rankedStats.min != null && <span>min {rankedStats.min.toFixed(2)}</span>}
                {rankedStats.median != null && <span>median {rankedStats.median.toFixed(2)}</span>}
                {rankedStats.max != null && <span>max {rankedStats.max.toFixed(2)}</span>}
              </div>
              <div className="max-h-[min(60vh,720px)] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="p-2 font-medium">#</th>
                      <th className="p-2 font-medium">Card</th>
                      <th className="p-2 font-medium">distance</th>
                      <th className="p-2 font-medium">Δ</th>
                      <th className="p-2 font-medium">flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastRanked.map((row, i) => {
                      const next = lastRanked[i + 1]
                      const delta = next ? next.distance - row.distance : null
                      const isWinner = i === 0
                      const ambiguous =
                        isWinner && next != null && delta != null && delta < phashGapMin + Number.EPSILON
                      const overTh = row.distance > phashDistanceMax
                      const flags = [
                        isWinner ? "best" : "",
                        ambiguous ? "tight-gap" : "",
                        overTh ? "over-distanceMax" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <tr
                          key={row.reference.id}
                          className={`border-b border-border/80 ${
                            isWinner && !overTh && !ambiguous ? "bg-emerald-500/15" : ""
                          } ${ambiguous ? "bg-amber-500/15" : ""} ${overTh ? "bg-destructive/10" : ""}`}
                        >
                          <td className="p-2 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <img src={row.reference.imageUrl} alt="" className="h-8 rounded border border-border/60" />
                              <span className="font-medium">{row.reference.name}</span>
                            </div>
                          </td>
                          <td className="p-2 font-mono">{row.distance}</td>
                          <td className="p-2 font-mono">{delta != null ? delta.toFixed(2) : "—"}</td>
                          <td className="p-2 text-muted-foreground">{flags || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {(refineDebug || ocrRaw || ocrHits.length > 0) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {refineDebug && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Edge refinement debug</CardTitle>
                <CardDescription>
                  Built from the <strong className="font-normal">raw</strong> 5:7 slot (before letterbox re-fit). Threshold = mean + k·σ on Sobel(inner); strong pixels {refineDebug.strongEdgeCount}.{" "}
                  {refineDebug.applied ? "Refine applied." : `Skipped: ${refineDebug.skipReason ?? "unknown"}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="font-mono text-muted-foreground">
                  thresh {refineDebug.thresh.toFixed(2)} · inner mean|σ mag {refineDebug.innerSample.meanMag.toFixed(2)} |{" "}
                  {refineDebug.innerSample.stdMag.toFixed(2)}
                </div>
                {refineDebug.rawBbox && (
                  <div className="font-mono text-muted-foreground">
                    raw bbox px: {refineDebug.rawBbox.minX},{refineDebug.rawBbox.minY} → {refineDebug.rawBbox.maxX},{refineDebug.rawBbox.maxY}
                  </div>
                )}
                {refineDebug.finalBbox && (
                  <div className="font-mono text-muted-foreground">
                    final 5:7 box: {refineDebug.finalBbox.sx},{refineDebug.finalBbox.sy} size {refineDebug.finalBbox.sw}×{refineDebug.finalBbox.sh}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["Raw slot", refineDebug.dataUrls.rawSlot],
                    ["High-pass", refineDebug.dataUrls.highPass],
                    ["Sobel magnitude", refineDebug.dataUrls.sobelMag],
                    ["Strong mask", refineDebug.dataUrls.strongMask],
                    ["BBox overlay", refineDebug.dataUrls.bboxOverlay],
                    ...(refineDebug.dataUrls.refinedSlot ? [["Refined out", refineDebug.dataUrls.refinedSlot]] as const : []),
                  ].map(([label, src]) => (
                    <div key={label} className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
                      <img src={src} alt="" className="w-full rounded border border-border bg-black object-contain" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">OCR + fuzzy pool</CardTitle>
              <CardDescription>
                Tesseract reads the <strong className="font-normal">last JPEG preview</strong> (refined crop). Fuse.js ranks loaded references on name + type line + oracle text. First run downloads WASM/data (~few MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => void runOcrOnLastCapture()} disabled={ocrLoading || !lastPreviewUrl || okPhashRefs.length === 0}>
                {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Run OCR on last capture
              </Button>
              {(ocrRaw || ocrQuery) && (
                <div className="rounded-md border border-border bg-muted/20 p-2 font-mono text-[11px]">
                  <div className="text-muted-foreground">Query (normalized)</div>
                  <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap">{ocrQuery || "—"}</div>
                  <div className="mt-2 text-muted-foreground">Raw OCR</div>
                  <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{ocrRaw || "—"}</div>
                </div>
              )}
              {ocrHits.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {ocrHits.map((h, i) => (
                    <li key={`${h.id}-${i}`} className="rounded border border-border/60 bg-card/40 p-2">
                      <div className="font-medium">
                        #{i + 1} {h.name}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        fuse score {h.fuseScore != null ? h.fuseScore.toFixed(4) : "—"} · id {h.id}
                      </div>
                      <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">{h.snippet}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Event log</CardTitle>
          <CardDescription>Last 200 messages (newest at bottom).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed">
            {log.length === 0 ? (
              <span className="text-muted-foreground">No events yet.</span>
            ) : (
              log.map((entry, i) => (
                <div key={`${entry.at}-${i}`} className="whitespace-pre-wrap break-all">
                  <span className="text-muted-foreground">{entry.at}</span>{" "}
                  <span
                    className={
                      entry.level === "error"
                        ? "text-destructive"
                        : entry.level === "warn"
                          ? "text-amber-700 dark:text-amber-400"
                          : ""
                    }
                  >
                    [{entry.level}]
                  </span>{" "}
                  {entry.message}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hash diagnostics</CardTitle>
          <CardDescription>
            pHash is the live matcher. RGB dHash helpers remain in <code className="text-[11px]">deck-scanner-rgb.ts</code> for experiments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={okPhashRefs.length === 0}
            onClick={() => {
              const ref = okPhashRefs[0]!
              void (async () => {
                try {
                  const rebuilt = await buildPhashScannerReference(ref.id, ref.name, ref.imageUrl)
                  const d = hammingPacked256(ref.packed, rebuilt.packed)
                  pushLog("info", `pHash rebuild check "${ref.name}": Hamming ${d} (expect 0).`)
                } catch (e) {
                  pushLog("error", e instanceof Error ? e.message : String(e))
                }
              })()
            }}
          >
            pHash rebuild check
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={okPhashRefs.length === 0}
            onClick={() => {
              const ref = okPhashRefs[0]!
              void (async () => {
                try {
                  const rgbRef = await buildRgbScannerReference(ref.id, ref.name, ref.imageUrl)
                  const rebuilt = await buildRgbScannerReference(ref.id, ref.name, ref.imageUrl)
                  const dr = hammingPacked256(rgbRef.r, rebuilt.r)
                  const dg = hammingPacked256(rgbRef.g, rebuilt.g)
                  const db = hammingPacked256(rgbRef.b, rebuilt.b)
                  pushLog("info", `RGB dHash rebuild (auxiliary) "${ref.name}": R ${dr} · G ${dg} · B ${db} (expect 0 each).`)
                } catch (e) {
                  pushLog("error", e instanceof Error ? e.message : String(e))
                }
              })()
            }}
          >
            RGB dHash rebuild (auxiliary)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
