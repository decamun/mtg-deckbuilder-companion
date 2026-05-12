import type { IFuseOptions } from "fuse.js"
import Fuse from "fuse.js"
import Tesseract from "tesseract.js"

export type OcrPoolEntry = {
  id: string
  name: string
  searchText: string
}

export type OcrSearchHit = {
  id: string
  name: string
  /** Fuse score (lower is better when present). */
  fuseScore: number | null
  snippet: string
}

/** Fuse index options for ranking OCR text against the pool (same as manual OCR). */
export const OCR_FUSE_POOL_OPTIONS: IFuseOptions<OcrPoolEntry> = {
  keys: ["searchText"],
  threshold: 0.52,
  distance: 200,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
}

/**
 * Collapse OCR noise (punctuation, symbols, brackets) so Fuse matches oracle text.
 * Keeps Unicode letters and numbers; NFKC helps full-width / odd apostrophe forms.
 */
export function normalizeOcrTextForFuseSearch(raw: string): string {
  const spaced = raw.replace(/\s+/g, " ").trim()
  if (!spaced) return ""
  try {
    return spaced
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000)
  } catch {
    return spaced
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000)
  }
}

export function createOcrFusePoolIndex(pool: ReadonlyArray<OcrPoolEntry>): Fuse<OcrPoolEntry> {
  return new Fuse([...pool], OCR_FUSE_POOL_OPTIONS)
}

export function searchOcrPoolHits(fuse: Fuse<OcrPoolEntry>, ocrOutput: string, limit: number): OcrSearchHit[] {
  const q = normalizeOcrTextForFuseSearch(ocrOutput)
  if (q.length < 2) return []
  return fuse.search(q, { limit }).map(r => ({
    id: r.item.id,
    name: r.item.name,
    fuseScore: r.score ?? null,
    snippet: r.item.searchText.slice(0, 160).replace(/\s+/g, " "),
  }))
}

export async function tesseractReadText(image: string | HTMLCanvasElement): Promise<{ rawText: string; query: string }> {
  let rawText: string
  try {
    const { data } = await Tesseract.recognize(image, "eng", { logger: () => {} })
    rawText = data.text ?? ""
  } catch (e) {
    throw new Error(`Tesseract: ${formatUnknownScannerError(e)}`)
  }
  const query = rawText.replace(/\s+/g, " ").trim().slice(0, 4000)
  return { rawText, query }
}

/** Stable string for thrown rejections that are not `Error` instances (common with WASM / workers). */
export function formatUnknownScannerError(reason: unknown): string {
  if (reason == null) {
    return "no error value (rejection was null/undefined — often CSP blocking worker, WASM, or jsDelivr fetches)"
  }
  if (reason instanceof Error) {
    return reason.message || reason.name || "Error"
  }
  if (typeof reason === "string" && reason.trim()) return reason
  if (typeof reason === "number" || typeof reason === "boolean") return String(reason)
  if (typeof reason === "object") {
    const o = reason as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message
    if (typeof o.error === "string" && o.error.trim()) return o.error
    try {
      return JSON.stringify(reason)
    } catch {
      return String(reason)
    }
  }
  return String(reason)
}

/**
 * OCR a card image (data URL or canvas) and fuzzy-search the reference pool
 * on concatenated name + type line + oracle text.
 */
export async function runCardOcrFuzzySearch(
  image: string | HTMLCanvasElement,
  pool: OcrPoolEntry[],
  maxResults = 12
): Promise<{ rawText: string; whitespaceQuery: string; fuseQuery: string; hits: OcrSearchHit[] }> {
  if (pool.length === 0) {
    return { rawText: "", whitespaceQuery: "", fuseQuery: "", hits: [] }
  }

  const { rawText, query: whitespaceQuery } = await tesseractReadText(image)
  const fuseQuery = normalizeOcrTextForFuseSearch(whitespaceQuery)
  const fuse = createOcrFusePoolIndex(pool)
  const hits = searchOcrPoolHits(fuse, whitespaceQuery, maxResults)
  return { rawText, whitespaceQuery, fuseQuery, hits }
}
