/**
 * Grayscale DCT pHash, ImageHash-style: resize to (hashSize * 4)², 2D DCT,
 * take top-left hashSize² AC coefficients, median → bits (packed 32 bytes for hashSize=16).
 *
 * Separate from `deck-scanner-rgb.ts` (per-channel RGB difference hash).
 */

import { captureFrameFromImageElement, loadImageQueued } from "@/lib/deck-scanner-visual"
import { hammingPacked256, PACKED_HASH_256_BYTES } from "@/lib/deck-scanner-rgb"

export const PHASH_SIZE = 16
const PHASH_IMG = PHASH_SIZE * 4

export type PhashScannerReference = {
  id: string
  name: string
  imageUrl: string
  packed: Uint8Array
  imageWidth: number
  imageHeight: number
  searchText: string
}

export type PhashRankedMatch = {
  reference: PhashScannerReference
  distance: number
}

export type PhashPickThresholds = {
  distanceMax: number
  gapMin: number
}

export const DEFAULT_PHASH_PICK: PhashPickThresholds = {
  distanceMax: 56,
  gapMin: 6,
}

function dct1d(x: Float64Array): Float64Array {
  const N = x.length
  const out = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    let s = 0
    for (let n = 0; n < N; n++) {
      s += x[n]! * Math.cos((Math.PI / N) * (n + 0.5) * k)
    }
    out[k] = s
  }
  return out
}

function dct2dSquare(gray: Float64Array, n: number): Float64Array {
  const tmp = new Float64Array(n * n)
  const out = new Float64Array(n * n)
  for (let r = 0; r < n; r++) {
    const row = new Float64Array(n)
    for (let c = 0; c < n; c++) row[c] = gray[r * n + c]!
    const d = dct1d(row)
    for (let c = 0; c < n; c++) tmp[r * n + c] = d[c]!
  }
  for (let c = 0; c < n; c++) {
    const col = new Float64Array(n)
    for (let r = 0; r < n; r++) col[r] = tmp[r * n + c]!
    const d = dct1d(col)
    for (let r = 0; r < n; r++) out[r * n + c] = d[r]!
  }
  return out
}

function medianOf256(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return (s[127]! + s[128]!) / 2
}

function packMedianBits(coeffs: Float64Array, size: number): Uint8Array {
  const flat: number[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      flat.push(coeffs[y * PHASH_IMG + x]!)
    }
  }
  const med = medianOf256(flat)
  const out = new Uint8Array(PACKED_HASH_256_BYTES)
  let bitIndex = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = coeffs[y * PHASH_IMG + x]!
      const bit = v > med ? 1 : 0
      const bi = bitIndex >> 3
      const bp = 7 - (bitIndex & 7)
      if (bit) out[bi]! |= 1 << bp
      bitIndex++
    }
  }
  return out
}

/** Grayscale DCT pHash (256 bits) from a card-sized canvas (e.g. 320×448). */
export function computeDctPhash256FromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const tmp = document.createElement("canvas")
  tmp.width = PHASH_IMG
  tmp.height = PHASH_IMG
  const ctx = tmp.getContext("2d", { willReadFrequently: true })
  if (!ctx) return new Uint8Array(PACKED_HASH_256_BYTES)
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, PHASH_IMG, PHASH_IMG)
  const { data } = ctx.getImageData(0, 0, PHASH_IMG, PHASH_IMG)
  const gray = new Float64Array(PHASH_IMG * PHASH_IMG)
  for (let i = 0; i < PHASH_IMG * PHASH_IMG; i++) {
    const o = i * 4
    gray[i] = data[o]! * 0.299 + data[o + 1]! * 0.587 + data[o + 2]! * 0.114
  }
  const dct = dct2dSquare(gray, PHASH_IMG)
  return packMedianBits(dct, PHASH_SIZE)
}

export async function buildPhashScannerReference(
  id: string,
  name: string,
  imageUrl: string,
  meta?: { typeLine?: string | null; oracleText?: string | null }
): Promise<PhashScannerReference> {
  const img = await loadImageQueued(imageUrl)
  const canvas = captureFrameFromImageElement(img)
  const packed = computeDctPhash256FromCanvas(canvas)
  const searchText = [name, meta?.typeLine, meta?.oracleText]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .join("\n")
    .slice(0, 8000)
  return {
    id,
    name,
    imageUrl,
    packed: new Uint8Array(packed),
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    searchText,
  }
}

export function rankPhashMatches(query: Uint8Array, refs: PhashScannerReference[]): PhashRankedMatch[] {
  return refs
    .map(reference => ({
      reference,
      distance: hammingPacked256(query, reference.packed),
    }))
    .sort((a, b) => a.distance - b.distance)
}

export type PhashPickResult = {
  match: PhashRankedMatch | null
  runnerUp: PhashRankedMatch | null
  rejectReason: string | null
}

export function pickPhashMatch(ranked: PhashRankedMatch[], t: PhashPickThresholds): PhashPickResult {
  const best = ranked[0]
  if (!best) {
    return { match: null, runnerUp: null, rejectReason: "No references loaded (ranked list empty)." }
  }
  const runnerUp = ranked[1] ?? null
  const gap = runnerUp == null ? t.gapMin : runnerUp.distance - best.distance
  if (best.distance > t.distanceMax) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Best distance ${best.distance} exceeds distanceMax (${t.distanceMax}).`,
    }
  }
  if (gap < t.gapMin) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Top-two gap ${gap.toFixed(1)} is below gapMin (${t.gapMin}) — ambiguous.`,
    }
  }
  return { match: best, runnerUp, rejectReason: null }
}
