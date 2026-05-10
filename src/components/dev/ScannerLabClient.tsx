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
import {
  applyPreferredAutofocus,
  describeCameraFocusCapabilities,
  nudgeAutofocusBeforeCapture,
  openCardCameraStream,
  readCameraFocusSetting,
} from "@/lib/camera-device"
import { getCardImageUrl, getCardsByIds, getCardsCollection, type ScryfallCard } from "@/lib/scryfall"
import {
  DEFAULT_MATCH_THRESHOLDS,
  type PickMatchResult,
  type RankedMatch,
  type ScannerReference,
  buildScannerReference,
  captureFrameFromImageElement,
  captureFrameFromVideo,
  confidenceFromScores,
  getArtCrop,
  getCenteredCardCrop,
  getCenteredCardCropPercents,
  hammingDistance,
  hashesForCanvas,
  hashesFromImageLikeCapture,
  loadImage,
  pickMatch,
  rankMatches,
} from "@/lib/deck-scanner-visual"

type LogEntry = { at: string; level: "info" | "warn" | "error"; message: string }

type ReferenceRow =
  | { status: "ok"; ref: ScannerReference }
  | { status: "error"; id: string; name: string; imageUrl?: string; message: string }

const DEMO_NAMES = ["Lightning Bolt", "Giant Growth", "Dark Ritual", "Counterspell", "Serra Angel"] as const

const DEFAULT_ID_LIST = [
  "a7d62dba-7394-4d42-8ee8-4af503a552f5",
  "9d1d4f93-f079-41db-9543-4428d04d8286",
].join("\n")

function expectHashLength(): number {
  return (9 - 1) * 8
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function ScannerLabClient() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [log, setLog] = useState<LogEntry[]>([])
  const pushLog = useCallback((level: LogEntry["level"], message: string) => {
    const at = new Date().toISOString()
    setLog(prev => [...prev.slice(-200), { at, level, message }])
  }, [])

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [idsInput, setIdsInput] = useState(DEFAULT_ID_LIST)
  const [namesInput, setNamesInput] = useState(DEMO_NAMES.join("\n"))
  const [referenceRows, setReferenceRows] = useState<ReferenceRow[]>([])
  const [referencesLoading, setReferencesLoading] = useState(false)

  const [matchThreshold, setMatchThreshold] = useState(DEFAULT_MATCH_THRESHOLDS.matchThreshold)
  const [gapThreshold, setGapThreshold] = useState(DEFAULT_MATCH_THRESHOLDS.gapThreshold)

  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null)
  const [lastCropMeta, setLastCropMeta] = useState<{
    sourceLabel: string
    frameW: number
    frameH: number
    outW: number
    outH: number
  } | null>(null)
  const [lastHashInfo, setLastHashInfo] = useState<{ fullBits: number; artBits: number } | null>(null)
  const [lastRanked, setLastRanked] = useState<RankedMatch[]>([])
  const [lastPick, setLastPick] = useState<PickMatchResult | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null)
  const [cameraFocusDebug, setCameraFocusDebug] = useState<string | null>(null)

  const okReferences = useMemo(
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
      const rows: ReferenceRow[] = []
      pushLog("info", `${label}: loading ${cards.length} printings…`)
      for (const card of cards) {
        const imageUrl = getCardImageUrl(card, "normal")
        const id = card.id
        const name = card.name
        if (!imageUrl) {
          rows.push({ status: "error", id, name, message: "No image_uris on this card (token?)" })
          continue
        }
        try {
          const ref = await buildScannerReference(id, name, imageUrl)
          rows.push({ status: "ok", ref })
          pushLog("info", `Reference OK: ${name} (${ref.imageWidth}×${ref.imageHeight})`)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          rows.push({ status: "error", id, name, imageUrl, message })
          pushLog("warn", `Reference failed: ${name} — ${message} (CORS or blocked image?)`)
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

  const runAnalysis = useCallback(
    (canvas: HTMLCanvasElement, sourceLabel: string, frameW: number, frameH: number) => {
      const preview = canvas.toDataURL("image/jpeg", 0.85)
      setLastPreviewUrl(preview)
      setLastCropMeta({
        sourceLabel,
        frameW,
        frameH,
        outW: canvas.width,
        outH: canvas.height,
      })
      const { fullHash, artHash } = hashesForCanvas(canvas)
      setLastHashInfo({ fullBits: fullHash.length, artBits: artHash.length })

      const ranked = rankMatches(fullHash, artHash, okReferences)
      setLastRanked(ranked)
      const pick = pickMatch(ranked, { matchThreshold, gapThreshold })
      setLastPick(pick)

      if (pick.match) {
        const conf = confidenceFromScores(pick.match.combinedScore, pick.runnerUp?.combinedScore ?? null)
        pushLog(
          "info",
          `Match: ${pick.match.reference.name} · combined ${pick.match.combinedScore.toFixed(2)} · confidence ${conf}%`
        )
      } else {
        pushLog("warn", `No pick: ${pick.rejectReason ?? "unknown"}`)
      }
    },
    [gapThreshold, matchThreshold, okReferences, pushLog]
  )

  const captureFromVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video) {
      pushLog("error", "Video element missing.")
      return
    }
    if (referencesLoading || okReferences.length === 0) {
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
      const canvas = captureFrameFromVideo(video)
      if (!canvas) {
        pushLog("error", "Video not ready (dimensions or readyState).")
        return
      }
      runAnalysis(canvas, "live camera", video.videoWidth, video.videoHeight)
    } finally {
      setCapturing(false)
    }
  }, [okReferences.length, pushLog, referencesLoading, runAnalysis])

  const onPickFile = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return
      if (referencesLoading || okReferences.length === 0) {
        pushLog("warn", "Build references first.")
        return
      }
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = captureFrameFromImageElement(img)
          runAnalysis(canvas, `file: ${file.name}`, img.naturalWidth, img.naturalHeight)
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
    [okReferences.length, pushLog, referencesLoading, runAnalysis]
  )

  const rankedStats = useMemo(() => {
    const scores = lastRanked.map(r => r.combinedScore)
    return {
      count: scores.length,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      median: median(scores),
    }
  }, [lastRanked])

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
          Standalone debugger for the physical deck scanner (dHash on Scryfall art vs camera crop). This route is not linked from the product nav — use it to inspect reference loads, per-card distances, threshold behavior, and ambiguous matches.
        </p>
        <p className="max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-medium">Likely PR #67 issue:</strong> references are hashed from the full Scryfall image, while captures hash a centered 5:7 crop resampled to 320×448. That geometry mismatch inflates Hamming distance for the true card. The &quot;Measure legacy vs camera-aligned&quot; control below quantifies the gap on your first loaded reference.
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
            <CardTitle className="text-base">Threshold overrides</CardTitle>
            <CardDescription>
              Production dialog uses matchThreshold {DEFAULT_MATCH_THRESHOLDS.matchThreshold}, gapThreshold{" "}
              {DEFAULT_MATCH_THRESHOLDS.gapThreshold}. Loosen them here to see what would have matched.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="match-th">matchThreshold (max combined score to accept)</Label>
                <Badge variant="outline">{matchThreshold}</Badge>
              </div>
              <input
                id="match-th"
                type="range"
                min={4}
                max={40}
                step={1}
                value={matchThreshold}
                onChange={e => setMatchThreshold(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="gap-th">gapThreshold (min top-two combined gap)</Label>
                <Badge variant="outline">{gapThreshold}</Badge>
              </div>
              <input
                id="gap-th"
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={gapThreshold}
                onChange={e => setGapThreshold(Number(e.target.value))}
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
                      const expected = expectHashLength()
                      const badLen = ref.fullHash.length !== expected || ref.artHash.length !== expected
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
                              {ref.imageWidth}×{ref.imageHeight} · hash bits full/art {ref.fullHash.length}/{ref.artHash.length}
                              {badLen ? " · unexpected length" : ""}
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
              <Button type="button" onClick={captureFromVideo} disabled={!!cameraError || referencesLoading || capturing}>
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Capture from camera
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
                  pushLog("info", "Cleared last capture analytics.")
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                Clear capture
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Output canvas is 320×448 (same as <code className="text-[11px]">DeckScannerDialog</code>). Hashes use 9×8 resize; expected bit length {(9 - 1) * 8}.
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
                    Orange guide in the camera matches this full frame; cyan is only the inner art rectangle used for the art half of the hash (often wider than tall).
                  </p>
                </div>
              )}
              {lastHashInfo && (
                <div className="font-mono text-xs text-muted-foreground">
                  hash lengths: full {lastHashInfo.fullBits}, art {lastHashInfo.artBits}
                </div>
              )}
              {lastPick && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">Pick result</div>
                  {lastPick.match ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      <li>Winner: {lastPick.match.reference.name}</li>
                      <li>
                        combined {lastPick.match.combinedScore.toFixed(2)} (full {lastPick.match.fullDistance} · art{" "}
                        {lastPick.match.artDistance})
                      </li>
                      <li>
                        confidence{" "}
                        {confidenceFromScores(
                          lastPick.match.combinedScore,
                          lastPick.runnerUp?.combinedScore ?? null
                        )}
                        %
                      </li>
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
                All references sorted by combined score (0.45×full + 0.55×art Hamming). Green row would win; orange rows are within gapThreshold of the winner (ambiguous).
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
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="p-2 font-medium">#</th>
                      <th className="p-2 font-medium">Card</th>
                      <th className="p-2 font-medium">full D</th>
                      <th className="p-2 font-medium">art D</th>
                      <th className="p-2 font-medium">combined</th>
                      <th className="p-2 font-medium">Δ to next</th>
                      <th className="p-2 font-medium">flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastRanked.map((row, i) => {
                      const next = lastRanked[i + 1]
                      const delta = next ? next.combinedScore - row.combinedScore : null
                      const isWinner = i === 0
                      const ambiguous =
                        isWinner && next != null && delta != null && delta < gapThreshold + Number.EPSILON
                      const overTh = row.combinedScore > matchThreshold
                      const flags = [
                        isWinner ? "best" : "",
                        ambiguous ? "tight-gap" : "",
                        overTh ? "over-threshold" : "",
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
                          <td className="p-2 font-mono">{row.fullDistance}</td>
                          <td className="p-2 font-mono">{row.artDistance}</td>
                          <td className="p-2 font-mono">{row.combinedScore.toFixed(2)}</td>
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
          <CardTitle className="text-base">Pipeline diagnostics</CardTitle>
          <CardDescription>
            Compare hashes stored today (full JPEG) against hashes computed the same way as a camera frame (centered 5:7 crop → 320×448).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={okReferences.length === 0}
            onClick={() => {
              const ref = okReferences[0]!
              void (async () => {
                try {
                  const img = await loadImage(ref.imageUrl)
                  const aligned = hashesFromImageLikeCapture(img)
                  const fd = hammingDistance(aligned.fullHash, ref.fullHash)
                  const ad = hammingDistance(aligned.artHash, ref.artHash)
                  pushLog(
                    "info",
                    `Legacy vs camera-aligned for "${ref.name}": full-hash Hamming ${fd}, art-hash Hamming ${ad}. (If the dialog built references like captures, these distances would be the right baseline for a reprint self-test.)`
                  )
                } catch (e) {
                  pushLog("error", e instanceof Error ? e.message : String(e))
                }
              })()
            }}
          >
            Measure legacy vs camera-aligned (first OK ref)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
