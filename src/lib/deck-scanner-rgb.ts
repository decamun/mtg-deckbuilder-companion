/**
 * Per-channel difference-hash on a 17×16 downsample → 16×16 = 256 bits per channel,
 * packed in 32 bytes (Moss-style RGB separation, browser-friendly).
 */

import { captureFrameFromImageElement, loadImageQueued } from "@/lib/deck-scanner-visual"

export const RGB_DHASH_PACK_BYTES = 32
const DOWNSAMPLE_W = 17
const DOWNSAMPLE_H = 16

export type RgbScannerReference = {
  id: string
  name: string
  imageUrl: string
  r: Uint8Array
  g: Uint8Array
  b: Uint8Array
  imageWidth: number
  imageHeight: number
}

export type RgbRankedMatch = {
  reference: RgbScannerReference
  distR: number
  distG: number
  distB: number
  meanDist: number
}

export type RgbPickThresholds = {
  /** Reject if best mean Hamming (across R,G,B) is above this (0–256). */
  meanMax: number
  /** Require at least this gap between best and second mean (ambiguous if too small). */
  gapMin: number
}

export const DEFAULT_RGB_PICK: RgbPickThresholds = {
  meanMax: 52,
  gapMin: 6,
}

export function hammingPacked256(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== RGB_DHASH_PACK_BYTES || b.length !== RGB_DHASH_PACK_BYTES) return 99999
  let bits = 0
  for (let i = 0; i < RGB_DHASH_PACK_BYTES; i++) {
    let x = a[i]! ^ b[i]!
    while (x) {
      bits += x & 1
      x >>>= 1
    }
  }
  return bits
}

function packChannelDhashFromRgba(data: Uint8ClampedArray, ch: 0 | 1 | 2): Uint8Array {
  const out = new Uint8Array(RGB_DHASH_PACK_BYTES)
  let bitIndex = 0
  for (let y = 0; y < DOWNSAMPLE_H; y++) {
    for (let x = 0; x < DOWNSAMPLE_W - 1; x++) {
      const i = (y * DOWNSAMPLE_W + x) * 4
      const j = (y * DOWNSAMPLE_W + x + 1) * 4
      const left = data[i + ch]!
      const right = data[j + ch]!
      if (left > right) {
        const bi = bitIndex >> 3
        const bp = 7 - (bitIndex & 7)
        out[bi]! |= 1 << bp
      }
      bitIndex++
    }
  }
  return out
}

/** Hash the full card canvas (e.g. 320×448) after downsample to 17×16. */
export function computeRgbDhash256FromCanvas(canvas: HTMLCanvasElement): { r: Uint8Array; g: Uint8Array; b: Uint8Array } {
  const tmp = document.createElement("canvas")
  tmp.width = DOWNSAMPLE_W
  tmp.height = DOWNSAMPLE_H
  const ctx = tmp.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    const z = new Uint8Array(RGB_DHASH_PACK_BYTES)
    return { r: z, g: z, b: z }
  }
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, DOWNSAMPLE_W, DOWNSAMPLE_H)
  const { data } = ctx.getImageData(0, 0, DOWNSAMPLE_W, DOWNSAMPLE_H)
  return {
    r: packChannelDhashFromRgba(data, 0),
    g: packChannelDhashFromRgba(data, 1),
    b: packChannelDhashFromRgba(data, 2),
  }
}

export async function buildRgbScannerReference(id: string, name: string, imageUrl: string): Promise<RgbScannerReference> {
  const img = await loadImageQueued(imageUrl)
  const canvas = captureFrameFromImageElement(img)
  const { r, g, b } = computeRgbDhash256FromCanvas(canvas)
  return {
    id,
    name,
    imageUrl,
    r: new Uint8Array(r),
    g: new Uint8Array(g),
    b: new Uint8Array(b),
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
  }
}

export function rankRgbMatches(
  qr: Uint8Array,
  qg: Uint8Array,
  qb: Uint8Array,
  refs: RgbScannerReference[],
  opts?: { quickRMax?: number | null }
): RgbRankedMatch[] {
  const quick = opts?.quickRMax
  const out: RgbRankedMatch[] = []
  for (const ref of refs) {
    const distR = hammingPacked256(qr, ref.r)
    if (quick != null && distR > quick) continue
    const distG = hammingPacked256(qg, ref.g)
    const distB = hammingPacked256(qb, ref.b)
    const meanDist = (distR + distG + distB) / 3
    out.push({ reference: ref, distR, distG, distB, meanDist })
  }
  out.sort((a, b) => a.meanDist - b.meanDist)
  return out
}

export type RgbPickResult = {
  match: RgbRankedMatch | null
  runnerUp: RgbRankedMatch | null
  rejectReason: string | null
}

export function pickRgbMatch(ranked: RgbRankedMatch[], t: RgbPickThresholds): RgbPickResult {
  const best = ranked[0]
  if (!best) {
    return {
      match: null,
      runnerUp: null,
      rejectReason: "No references matched the quick filter (or library empty).",
    }
  }
  const runnerUp = ranked[1] ?? null
  const gap = runnerUp == null ? t.gapMin : runnerUp.meanDist - best.meanDist
  if (best.meanDist > t.meanMax) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Best mean distance ${best.meanDist.toFixed(1)} exceeds meanMax (${t.meanMax}).`,
    }
  }
  if (gap < t.gapMin) {
    return {
      match: null,
      runnerUp,
      rejectReason: `Top-two mean gap ${gap.toFixed(1)} is below gapMin (${t.gapMin}) — ambiguous.`,
    }
  }
  return { match: best, runnerUp, rejectReason: null }
}
