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

  const { data } = await Tesseract.recognize(image, "eng", { logger: () => {} })
  const rawText = data.text ?? ""
  const query = rawText.replace(/\s+/g, " ").trim().slice(0, 4000)

  const fuse = new Fuse(pool, {
    keys: ["searchText"],
    threshold: 0.52,
    distance: 200,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  })

  const results = query.length >= 2 ? fuse.search(query, { limit: maxResults }) : []

  const hits: OcrSearchHit[] = results.map(r => ({
    id: r.item.id,
    name: r.item.name,
    fuseScore: r.score ?? null,
    snippet: r.item.searchText.slice(0, 160).replace(/\s+/g, " "),
  }))

  return { rawText, query, hits }
}
