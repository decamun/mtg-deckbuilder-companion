export interface ExternalDeckFetchResult {
  /** Stable provider id (e.g. `archidekt`). */
  source: string
  /** Suggested deck title from the remote site, if known. */
  deckName: string | null
  /** Plain decklist text compatible with `parseDecklist` / `resolveDecklist`. */
  decklistText: string
}

export interface ExternalDeckProvider {
  readonly id: string
  readonly label: string
  /** Hostnames without leading `www.` */
  readonly hostnames: readonly string[]
  supportsHost(hostname: string): boolean
  /**
   * Fetch and normalize a decklist. Implementations should rebuild fetch URLs
   * from structured URL parts (path segments, ids) — do not pass arbitrary user
   * query strings to backend fetches.
   */
  importFromUrl(url: URL): Promise<ExternalDeckFetchResult>
}
