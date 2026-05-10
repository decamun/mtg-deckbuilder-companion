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
): Promise<{ rawText: string; query: string; hits: OcrSearchHit[] }> {
  if (pool.length === 0) {
    return { rawText: "", query: "", hits: [] }
  }

  let rawText: string
  try {
    const { data } = await Tesseract.recognize(image, "eng", { logger: () => {} })
    rawText = data.text ?? ""
  } catch (e) {
    throw new Error(`Tesseract: ${formatUnknownScannerError(e)}`)
  }

  const query = rawText.replace(/\s+/g, " ").trim().slice(0, 4000)

  let hits: OcrSearchHit[]
  try {
    const fuse = new Fuse(pool, {
      keys: ["searchText"],
      threshold: 0.52,
      distance: 200,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeScore: true,
    })

    const results = query.length >= 2 ? fuse.search(query, { limit: maxResults }) : []

    hits = results.map(r => ({
      id: r.item.id,
      name: r.item.name,
      fuseScore: r.score ?? null,
      snippet: r.item.searchText.slice(0, 160).replace(/\s+/g, " "),
    }))
  } catch (e) {
    throw new Error(`Fuse search: ${formatUnknownScannerError(e)}`)
  }

  return { rawText, query, hits }
}
