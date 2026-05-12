/**
 * Refines a fixed 320×448 "card slot" crop using high-pass luminance + Sobel edges
 * + bounding box (5:7 clamp). Exposes diagnostics for scanner-lab UI.
 */

const CARD_AR = 5 / 7

export type EdgeRefineOptions = {
  blurRadius?: number
  sobelK?: number
  marginPx?: number
  minStrongEdgeRatio?: number
  maxBoxCoverage?: number
  aspectSlack?: number
  /** Fraction of frame treated as “inner” for stats and edge collection (0.1 → 10%–90%). */
  innerPadFrac?: number
  /**
   * 0 = off. Down-weights strong edges in the lower part of the slot (hands, shirt, chest)
   * where the physical card rarely sits, before thresholding.
   */
  lowerThirdBias?: number
  /** Drop this fraction of total edge mass from each side when forming the bbox (outlier columns/rows). */
  massTrimFrac?: number
}

const DEFAULTS: Required<EdgeRefineOptions> = {
  blurRadius: 10,
  sobelK: 1.32,
  marginPx: 8,
  minStrongEdgeRatio: 0.018,
  maxBoxCoverage: 0.74,
  aspectSlack: 0.2,
  innerPadFrac: 0.1,
  lowerThirdBias: 0.55,
  massTrimFrac: 0.045,
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

function innerRoiRect(w: number, h: number, innerPadFrac: number) {
  const p = innerPadFrac
  return {
    x0: Math.floor(w * p),
    x1: Math.ceil(w * (1 - p)),
    y0: Math.floor(h * p),
    y1: Math.ceil(h * (1 - p)),
  }
}

/** Down-weight lower frame (shirt / hands) before edge thresholding. */
function lowerRegionEdgeWeight(y: number, h: number, bias: number): number {
  if (bias <= 0) return 1
  const ny = (y + 0.5) / h
  if (ny < 0.4) return 1
  const t = (ny - 0.4) / 0.6
  const f = 1 - bias * t * t
  return Math.max(0.32, f)
}

/**
 * Column/row mass trimming: ignore sparse fringe columns and rows so a few
 * strong edges (hair, shelf) do not stretch the bbox away from the card.
 */
function trimmedStrongBounds(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  trimFrac: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const colW = new Float32Array(w)
  const rowW = new Float32Array(h)
  let total = 0
  for (let y = y0; y < y1; y++) {
    const yo = y * w
    for (let x = x0; x < x1; x++) {
      if (!mask[yo + x]!) continue
      colW[x] += 1
      rowW[y] += 1
      total += 1
    }
  }
  if (total < 48) return null
  const trimLo = total * Math.min(0.15, Math.max(0.01, trimFrac))
  let acc = 0
  let minX = x1 - 1
  for (let x = x0; x < x1; x++) {
    acc += colW[x]!
    if (acc >= trimLo) {
      minX = x
      break
    }
  }
  acc = 0
  let maxX = x0
  for (let x = x1 - 1; x >= x0; x--) {
    acc += colW[x]!
    if (acc >= trimLo) {
      maxX = x
      break
    }
  }
  acc = 0
  let minY = y1 - 1
  for (let y = y0; y < y1; y++) {
    acc += rowW[y]!
    if (acc >= trimLo) {
      minY = y
      break
    }
  }
  acc = 0
  let maxY = y0
  for (let y = y1 - 1; y >= y0; y--) {
    acc += rowW[y]!
    if (acc >= trimLo) {
      maxY = y
      break
    }
  }
  if (maxX <= minX || maxY <= minY) return null
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  if (bw < w * 0.2 || bh < h * 0.2) return null
  return { minX, minY, maxX, maxY }
}

function floatGrayToDataUrl(gray: Float32Array, w: number, h: number, mode: "symmetric" | "positive"): string {
  let lo = Infinity
  let hi = -Infinity
  let maxAbs = 0
  for (let i = 0; i < w * h; i++) {
    const v = gray[i]!
    if (mode === "symmetric") {
      maxAbs = Math.max(maxAbs, Math.abs(v))
    } else {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (mode === "symmetric") {
    if (maxAbs < 1e-6) maxAbs = 1
    lo = 0
    hi = maxAbs
  } else {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      lo = 0
      hi = 1
    }
  }
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (!ctx) return ""
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    let t: number
    if (mode === "symmetric") {
      t = (Math.abs(gray[i]!) / maxAbs) * 255
    } else {
      t = ((gray[i]! - lo) / (hi - lo)) * 255
    }
    const b = Math.max(0, Math.min(255, Math.round(t)))
    d[p] = b
    d[p + 1] = b
    d[p + 2] = b
    d[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL("image/png")
}

function maskToDataUrl(mask: Uint8Array, w: number, h: number): string {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (!ctx) return ""
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const v = mask[i]! ? 255 : 0
    d[p] = v
    d[p + 1] = v
    d[p + 2] = v
    d[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL("image/png")
}

function drawBboxOnCanvasCopy(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number): string {
  const c = document.createElement("canvas")
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(src, 0, 0)
  ctx.strokeStyle = "rgba(255, 60, 60, 0.95)"
  ctx.lineWidth = 3
  ctx.strokeRect(sx + 1.5, sy + 1.5, sw - 3, sh - 3)
  ctx.fillStyle = "rgba(255,60,60,0.85)"
  ctx.font = "12px ui-monospace, monospace"
  ctx.fillText(`${sw}×${sh}`, sx + 4, sy + 16)
  return c.toDataURL("image/png")
}

type PipelineResult = {
  applied: boolean
  skipReason?: string
  thresh: number
  strongEdgeCount: number
  rawMinX: number
  rawMinY: number
  rawMaxX: number
  rawMaxY: number
  paddedMinX: number
  paddedMinY: number
  paddedMaxX: number
  paddedMaxY: number
  finalBbox: { sx: number; sy: number; sw: number; sh: number } | null
  hp: Float32Array
  mag: Float32Array
  mask: Uint8Array
  w: number
  h: number
}

function runPipeline(src: HTMLCanvasElement, o: Required<EdgeRefineOptions>): PipelineResult {
  const w = src.width
  const h = src.height
  const emptyMask = () => new Uint8Array(w * h)
  if (w < 32 || h < 32) {
    return {
      applied: false,
      skipReason: "canvas too small",
      thresh: 0,
      strongEdgeCount: 0,
      rawMinX: 0,
      rawMinY: 0,
      rawMaxX: 0,
      rawMaxY: 0,
      paddedMinX: 0,
      paddedMinY: 0,
      paddedMaxX: 0,
      paddedMaxY: 0,
      finalBbox: null,
      hp: new Float32Array(0),
      mag: new Float32Array(0),
      mask: emptyMask(),
      w,
      h,
    }
  }
  const ctx = src.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    return {
      applied: false,
      skipReason: "no 2d context",
      thresh: 0,
      strongEdgeCount: 0,
      rawMinX: 0,
      rawMinY: 0,
      rawMaxX: 0,
      rawMaxY: 0,
      paddedMinX: 0,
      paddedMinY: 0,
      paddedMaxX: 0,
      paddedMaxY: 0,
      finalBbox: null,
      hp: new Float32Array(0),
      mag: new Float32Array(0),
      mask: emptyMask(),
      w,
      h,
    }
  }
  const { data } = ctx.getImageData(0, 0, w, h)
  const lum = luminanceFromImageData(data, w, h)
  const blur = boxBlurSeparable(lum, w, h, o.blurRadius)
  const hp = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    hp[i] = lum[i]! - blur[i]!
  }
  const mag = sobelMagnitude(hp, w, h)
  const inner = innerRoiRect(w, h, o.innerPadFrac)
  const { x0, x1, y0, y1 } = inner

  const magEff = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const yo = y * w
    const wy = lowerRegionEdgeWeight(y, h, o.lowerThirdBias)
    for (let x = 0; x < w; x++) {
      magEff[yo + x] = mag[yo + x]! * wy
    }
  }

  let sum = 0
  let sumsq = 0
  let innerCount = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = magEff[y * w + x]!
      sum += v
      sumsq += v * v
      innerCount++
    }
  }
  if (innerCount === 0) {
    return {
      applied: false,
      skipReason: "empty inner window",
      thresh: 0,
      strongEdgeCount: 0,
      rawMinX: 0,
      rawMinY: 0,
      rawMaxX: 0,
      rawMaxY: 0,
      paddedMinX: 0,
      paddedMinY: 0,
      paddedMaxX: 0,
      paddedMaxY: 0,
      finalBbox: null,
      hp,
      mag: magEff,
      mask: emptyMask(),
      w,
      h,
    }
  }
  const mean = sum / innerCount
  const std = Math.sqrt(Math.max(0, sumsq / innerCount - mean * mean))
  const thresh = mean + o.sobelK * Math.max(std, 1e-6)

  const mask = new Uint8Array(w * h)
  let strong = 0
  for (let y = y0; y < y1; y++) {
    const yo = y * w
    for (let x = x0; x < x1; x++) {
      const i = yo + x
      if (magEff[i]! > thresh) {
        mask[i] = 1
        strong++
      }
    }
  }

  const trimmed = trimmedStrongBounds(mask, w, h, x0, x1, y0, y1, o.massTrimFrac)
  let minX: number
  let minY: number
  let maxX: number
  let maxY: number
  if (trimmed) {
    minX = trimmed.minX
    minY = trimmed.minY
    maxX = trimmed.maxX
    maxY = trimmed.maxY
  } else {
    minX = w
    minY = h
    maxX = 0
    maxY = 0
    for (let y = y0; y < y1; y++) {
      const yo = y * w
      for (let x = x0; x < x1; x++) {
        const i = yo + x
        if (!mask[i]) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const area = w * h
  const rawMinX = minX
  const rawMinY = minY
  const rawMaxX = maxX
  const rawMaxY = maxY

  if (strong < area * o.minStrongEdgeRatio || maxX <= minX || maxY <= minY) {
    return {
      applied: false,
      skipReason: "too few strong edges or degenerate bbox",
      thresh,
      strongEdgeCount: strong,
      rawMinX,
      rawMinY,
      rawMaxX,
      rawMaxY,
      paddedMinX: 0,
      paddedMinY: 0,
      paddedMaxX: 0,
      paddedMaxY: 0,
      finalBbox: null,
      hp,
      mag: magEff,
      mask,
      w,
      h,
    }
  }

  const pMinX = Math.max(0, minX - o.marginPx)
  const pMinY = Math.max(0, minY - o.marginPx)
  const pMaxX = Math.min(w - 1, maxX + o.marginPx)
  const pMaxY = Math.min(h - 1, maxY + o.marginPx)

  const { sx, sy, sw, sh } = clampAspectBox(pMinX, pMinY, pMaxX, pMaxY, o.aspectSlack)
  if (sw < w * 0.28 || sh < h * 0.28) {
    return {
      applied: false,
      skipReason: "bbox too small after clamp",
      thresh,
      strongEdgeCount: strong,
      rawMinX,
      rawMinY,
      rawMaxX,
      rawMaxY,
      paddedMinX: pMinX,
      paddedMinY: pMinY,
      paddedMaxX: pMaxX,
      paddedMaxY: pMaxY,
      finalBbox: { sx, sy, sw, sh },
      hp,
      mag: magEff,
      mask,
      w,
      h,
    }
  }
  const cov = (sw * sh) / area
  if (cov > o.maxBoxCoverage) {
    return {
      applied: false,
      skipReason: "bbox covers nearly full frame",
      thresh,
      strongEdgeCount: strong,
      rawMinX,
      rawMinY,
      rawMaxX,
      rawMaxY,
      paddedMinX: pMinX,
      paddedMinY: pMinY,
      paddedMaxX: pMaxX,
      paddedMaxY: pMaxY,
      finalBbox: { sx, sy, sw, sh },
      hp,
      mag: magEff,
      mask,
      w,
      h,
    }
  }

  return {
    applied: true,
    thresh,
    strongEdgeCount: strong,
    rawMinX,
    rawMinY,
    rawMaxX,
    rawMaxY,
    paddedMinX: pMinX,
    paddedMinY: pMinY,
    paddedMaxX: pMaxX,
    paddedMaxY: pMaxY,
    finalBbox: { sx, sy, sw, sh },
    hp,
    mag: magEff,
    mask,
    w,
    h,
  }
}

export type EdgeRefinementDebug = {
  applied: boolean
  skipReason?: string
  thresh: number
  strongEdgeCount: number
  innerSample: { meanMag: number; stdMag: number }
  rawBbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  paddedBbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  finalBbox: { sx: number; sy: number; sw: number; sh: number } | null
  dataUrls: {
    rawSlot: string
    highPass: string
    sobelMag: string
    strongMask: string
    bboxOverlay: string
    refinedSlot?: string
  }
}

function meanStdMag(mag: Float32Array, w: number, h: number, x0: number, x1: number, y0: number, y1: number) {
  let s = 0
  let sq = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = mag[y * w + x]!
      s += v
      sq += v * v
      n++
    }
  }
  const mean = n ? s / n : 0
  const std = n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0
  return { mean, std }
}

/** Build PNG data URLs for UI: high-pass, Sobel magnitude, threshold mask, bbox on raw slot, optional refined. */
export function analyzeEdgeRefinementDebug(rawSlot: HTMLCanvasElement, opts?: EdgeRefineOptions): EdgeRefinementDebug {
  const o = { ...DEFAULTS, ...opts }
  const p = runPipeline(rawSlot, o)
  const w = p.w
  const h = p.h
  const { x0, x1, y0, y1 } = innerRoiRect(w, h, o.innerPadFrac)
  const { mean, std } = meanStdMag(p.mag, w, h, x0, x1, y0, y1)

  const rawSlotUrl = rawSlot.toDataURL("image/png")
  const highPass = p.hp.length ? floatGrayToDataUrl(p.hp, w, h, "symmetric") : ""
  const sobelMag = p.mag.length ? floatGrayToDataUrl(p.mag, w, h, "positive") : ""
  const strongMask = p.mask.length ? maskToDataUrl(p.mask, w, h) : ""

  let bboxOverlay = rawSlotUrl
  if (p.finalBbox) {
    bboxOverlay = drawBboxOnCanvasCopy(rawSlot, p.finalBbox.sx, p.finalBbox.sy, p.finalBbox.sw, p.finalBbox.sh)
  } else if (p.rawMaxX >= p.rawMinX && p.rawMaxY >= p.rawMinY) {
    bboxOverlay = drawBboxOnCanvasCopy(rawSlot, p.rawMinX, p.rawMinY, p.rawMaxX - p.rawMinX + 1, p.rawMaxY - p.rawMinY + 1)
  }

  let refinedSlot: string | undefined
  if (p.applied && p.finalBbox) {
    const out = document.createElement("canvas")
    out.width = w
    out.height = h
    const octx = out.getContext("2d")
    if (octx) {
      octx.fillStyle = "#101010"
      octx.fillRect(0, 0, w, h)
      const { sx, sy, sw, sh } = p.finalBbox
      octx.drawImage(rawSlot, sx, sy, sw, sh, 0, 0, w, h)
      refinedSlot = out.toDataURL("image/png")
    }
  }

  return {
    applied: p.applied,
    skipReason: p.skipReason,
    thresh: p.thresh,
    strongEdgeCount: p.strongEdgeCount,
    innerSample: { meanMag: mean, stdMag: std },
    rawBbox:
      p.rawMaxX >= p.rawMinX && p.rawMaxY >= p.rawMinY
        ? { minX: p.rawMinX, minY: p.rawMinY, maxX: p.rawMaxX, maxY: p.rawMaxY }
        : null,
    paddedBbox:
      p.paddedMaxX >= p.paddedMinX && p.paddedMaxY >= p.paddedMinY
        ? { minX: p.paddedMinX, minY: p.paddedMinY, maxX: p.paddedMaxX, maxY: p.paddedMaxY }
        : null,
    finalBbox: p.finalBbox,
    dataUrls: {
      rawSlot: rawSlotUrl,
      highPass,
      sobelMag,
      strongMask,
      bboxOverlay,
      refinedSlot,
    },
  }
}

export function refineCardCanvasByEdges(src: HTMLCanvasElement, opts?: EdgeRefineOptions): HTMLCanvasElement {
  const o = { ...DEFAULTS, ...opts }
  const p = runPipeline(src, o)
  if (!p.applied || !p.finalBbox) return src
  const { sx, sy, sw, sh } = p.finalBbox
  const out = document.createElement("canvas")
  out.width = p.w
  out.height = p.h
  const octx = out.getContext("2d")
  if (!octx) return src
  octx.fillStyle = "#101010"
  octx.fillRect(0, 0, p.w, p.h)
  octx.drawImage(src, sx, sy, sw, sh, 0, 0, p.w, p.h)
  return out
}
