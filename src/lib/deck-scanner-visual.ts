/**
 * Perceptual hashing + scoring for the physical deck scanner (PR #67 prototype).
 * Kept framework-free so `/scanner-lab` and `DeckScannerDialog` can share logic.
 */

export type HashBits = Uint8Array

export const HASH_WIDTH = 9
export const HASH_HEIGHT = 8
export const MATCH_THRESHOLD = 20
export const GAP_THRESHOLD = 3
export const FULL_WEIGHT = 0.45
export const ART_WEIGHT = 0.55

export type MatchThresholds = {
  matchThreshold: number
  gapThreshold: number
}

export const DEFAULT_MATCH_THRESHOLDS: MatchThresholds = {
  matchThreshold: MATCH_THRESHOLD,
  gapThreshold: GAP_THRESHOLD,
}

export function getCenteredCardCrop(width: number, height: number) {
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

/** Same rectangle as `getCenteredCardCrop`, as % of full frame (for UI overlays). */
export function getCenteredCardCropPercents(width: number, height: number) {
  const c = getCenteredCardCrop(width, height)
  return {
    left: (c.sx / width) * 100,
    top: (c.sy / height) * 100,
    width: (c.sw / width) * 100,
    height: (c.sh / height) * 100,
  }
}

export function getArtCrop(width: number, height: number) {
  return {
    sx: width * 0.09,
    sy: height * 0.17,
    sw: width * 0.82,
    sh: height * 0.38,
  }
}

export function computeDHash(
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

export function hammingDistance(a: HashBits, b: HashBits): number {
  let distance = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) distance++
  }
  return distance + Math.abs(a.length - b.length)
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Image failed to load"))
    img.src = url
  })
}

export function confidenceFromScores(score: number, runnerUpScore: number | null): number {
  const gap = runnerUpScore == null ? GAP_THRESHOLD : runnerUpScore - score
  const scoreComponent = Math.max(0, 1 - score / 32)
  const gapComponent = Math.max(0, Math.min(1, gap / 10))
  return Math.round((scoreComponent * 0.65 + gapComponent * 0.35) * 100)
}

export type ScannerReference = {
  id: string
  name: string
  imageUrl: string
  fullHash: HashBits
  artHash: HashBits
  imageWidth: number
  imageHeight: number
}

export type RankedMatch = {
  reference: ScannerReference
  fullDistance: number
  artDistance: number
  combinedScore: number
}

export function rankMatches(fullHash: HashBits, artHash: HashBits, references: ScannerReference[]): RankedMatch[] {
  return references
    .map(reference => {
      const fullDistance = hammingDistance(fullHash, reference.fullHash)
      const artDistance = hammingDistance(artHash, reference.artHash)
      const combinedScore = fullDistance * FULL_WEIGHT + artDistance * ART_WEIGHT
      return { reference, fullDistance, artDistance, combinedScore }
    })
    .sort((a, b) => a.combinedScore - b.combinedScore)
}

export type PickMatchResult = {
  match: RankedMatch | null
  runnerUp: RankedMatch | null
  rejectReason: string | null
}

export function pickMatch(
  ranked: RankedMatch[],
  thresholds: MatchThresholds = DEFAULT_MATCH_THRESHOLDS
): PickMatchResult {
  const best = ranked[0]
  if (!best) {
    return { match: null, runnerUp: null, rejectReason: "No references loaded (ranked list empty)." }
  }
  const runnerUp = ranked[1] ?? null
  const gap = runnerUp == null ? thresholds.gapThreshold : runnerUp.combinedScore - best.combinedScore
  if (best.combinedScore > thresholds.matchThreshold) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Best combined score ${best.combinedScore.toFixed(2)} is above matchThreshold (${thresholds.matchThreshold}).`,
    }
  }
  if (gap < thresholds.gapThreshold) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Top-two gap ${gap.toFixed(2)} is below gapThreshold (${thresholds.gapThreshold}) — match is ambiguous.`,
    }
  }
  return { match: best, runnerUp, rejectReason: null }
}

export async function buildScannerReference(
  id: string,
  name: string,
  imageUrl: string
): Promise<ScannerReference> {
  const img = await loadImage(imageUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const fullHash = computeDHash(img, w, h)
  const artCrop = getArtCrop(w, h)
  const artHash = computeDHash(img, w, h, artCrop)
  return {
    id,
    name,
    imageUrl,
    fullHash,
    artHash,
    imageWidth: w,
    imageHeight: h,
  }
}

/** Same crop + output size as `DeckScannerDialog.captureCard`. */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  outWidth = 320,
  outHeight = 448
): HTMLCanvasElement | null {
  if (video.readyState < 2) return null
  const frameWidth = video.videoWidth
  const frameHeight = video.videoHeight
  if (frameWidth === 0 || frameHeight === 0) return null
  const crop = getCenteredCardCrop(frameWidth, frameHeight)
  const canvas = document.createElement("canvas")
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function hashesForCanvas(canvas: HTMLCanvasElement): { fullHash: HashBits; artHash: HashBits } {
  const w = canvas.width
  const h = canvas.height
  const fullHash = computeDHash(canvas, w, h)
  const artCrop = getArtCrop(w, h)
  const artHash = computeDHash(canvas, w, h, artCrop)
  return { fullHash, artHash }
}

/** Same centered crop + output size as the live camera path, for still-image debugging. */
export function captureFrameFromImageElement(img: HTMLImageElement, outWidth = 320, outHeight = 448): HTMLCanvasElement {
  const frameWidth = img.naturalWidth
  const frameHeight = img.naturalHeight
  const crop = getCenteredCardCrop(frameWidth, frameHeight)
  const canvas = document.createElement("canvas")
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas context")
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Same resize + hash regions as a camera capture, but from a loaded printing image. */
export function hashesFromImageLikeCapture(img: HTMLImageElement, outWidth = 320, outHeight = 448) {
  const canvas = captureFrameFromImageElement(img, outWidth, outHeight)
  return hashesForCanvas(canvas)
}
