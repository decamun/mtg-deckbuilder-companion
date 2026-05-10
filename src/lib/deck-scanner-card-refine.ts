/**
 * Refines a fixed 320×448 "card slot" crop by finding a tighter interior crop
 * via high-pass (texture) + Sobel edges + bounding box, then re-normalizing
 * to the same output size so downstream hashes stay comparable.
 *
 * This is separate from the legacy centered 5:7 crop from the camera frame
 * (`getCenteredCardCrop`); it runs *after* that step.
 */

const CARD_AR = 5 / 7

export type EdgeRefineOptions = {
  /** Box blur radius on luminance (reduces playmat gradients before edges). */
  blurRadius?: number
  /** Edge magnitude threshold = mean + k * std (inner region only). */
  sobelK?: number
  /** Pixels to pad around the detected box. */
  marginPx?: number
  /** Minimum fraction of pixels that must count as "strong edge" to trust the box. */
  minStrongEdgeRatio?: number
  /** If refined box covers more than this fraction of the frame, assume no gain and skip. */
  maxBoxCoverage?: number
  /** Allowed deviation from 5:7 before we letterbox the crop back to 5:7. */
  aspectSlack?: number
}

const DEFAULTS: Required<EdgeRefineOptions> = {
  blurRadius: 10,
  sobelK: 1.15,
  marginPx: 10,
  minStrongEdgeRatio: 0.018,
  maxBoxCoverage: 0.92,
  aspectSlack: 0.22,
}

function luminanceFromImageData(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    g[i] = data[p]! * 0.299 + data[p + 1]! * 0.587 + data[p + 2]! * 0.114
  }
  return g
}

function boxBlurSeparable(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const normH = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const yo = y * w
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx))
        s += src[yo + xx]!
      }
      tmp[yo + x] = s * normH
    }
  }
  const normV = 1 / (2 * r + 1)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        s += tmp[yy * w + x]!
      }
      out[y * w + x] = s * normV
    }
  }
  return out
}

function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h)
  const at = (x: number, y: number) => gray[y * w + x]!
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) -
        2 * at(x - 1, y) +
        2 * at(x + 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1)
      mag[y * w + x] = Math.hypot(gx, gy)
    }
  }
  return mag
}

function clampAspectBox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  slack: number
): { sx: number; sy: number; sw: number; sh: number } {
  let sx = minX
  let sy = minY
  let sw = maxX - minX + 1
  let sh = maxY - minY + 1
  const ar = sw / sh
  const lo = CARD_AR * (1 - slack)
  const hi = CARD_AR * (1 + slack)
  if (ar > hi) {
    const targetW = Math.round(sh * CARD_AR)
    const pad = Math.floor((sw - targetW) / 2)
    sx += pad
    sw = targetW
  } else if (ar < lo) {
    const targetH = Math.round(sw / CARD_AR)
    const pad = Math.floor((sh - targetH) / 2)
    sy += pad
    sh = targetH
  }
  return { sx, sy, sw, sh }
}

/**
 * Tighten a 320×448 (or any) card crop using texture high-pass + edge bbox.
 * Returns `src` unchanged when heuristics say the refine is unreliable.
 */
export function refineCardCanvasByEdges(
  src: HTMLCanvasElement,
  opts?: EdgeRefineOptions
): HTMLCanvasElement {
  const o = { ...DEFAULTS, ...opts }
  const w = src.width
  const h = src.height
  if (w < 32 || h < 32) return src

  const ctx = src.getContext("2d", { willReadFrequently: true })
  if (!ctx) return src
  const { data } = ctx.getImageData(0, 0, w, h)
  const lum = luminanceFromImageData(data, w, h)
  const blur = boxBlurSeparable(lum, w, h, o.blurRadius)
  const hp = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    hp[i] = lum[i]! - blur[i]!
  }

  const mag = sobelMagnitude(hp, w, h)

  let sum = 0
  let sumsq = 0
  let inner = 0
  const x0 = Math.floor(w * 0.08)
  const x1 = Math.ceil(w * 0.92)
  const y0 = Math.floor(h * 0.08)
  const y1 = Math.ceil(h * 0.92)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = mag[y * w + x]!
      sum += v
      sumsq += v * v
      inner++
    }
  }
  if (inner === 0) return src
  const mean = sum / inner
  const std = Math.sqrt(Math.max(0, sumsq / inner - mean * mean))
  const thresh = mean + o.sobelK * Math.max(std, 1e-6)

  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let strong = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mag[y * w + x]! > thresh) {
        strong++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const area = w * h
  if (strong < area * o.minStrongEdgeRatio) return src
  if (maxX <= minX || maxY <= minY) return src

  minX = Math.max(0, minX - o.marginPx)
  minY = Math.max(0, minY - o.marginPx)
  maxX = Math.min(w - 1, maxX + o.marginPx)
  maxY = Math.min(h - 1, maxY + o.marginPx)

  const { sx, sy, sw, sh } = clampAspectBox(minX, minY, maxX, maxY, o.aspectSlack)
  if (sw < w * 0.28 || sh < h * 0.28) return src

  const cov = (sw * sh) / area
  if (cov > o.maxBoxCoverage) return src

  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  const octx = out.getContext("2d")
  if (!octx) return src
  octx.fillStyle = "#101010"
  octx.fillRect(0, 0, w, h)
  octx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h)
  return out
}
