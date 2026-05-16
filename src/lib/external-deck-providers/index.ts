import { archidektProvider } from "@/lib/external-deck-providers/archidekt"
import { moxfieldProvider } from "@/lib/external-deck-providers/moxfield"
import { tappedOutProvider } from "@/lib/external-deck-providers/tappedout"
import type { ExternalDeckProvider, ExternalDeckFetchResult } from "@/lib/external-deck-providers/types"

/**
 * Ordered list of deck URL providers. Append new providers here to extend support.
 */
export const EXTERNAL_DECK_PROVIDERS: readonly ExternalDeckProvider[] = [
  archidektProvider,
  moxfieldProvider,
  tappedOutProvider,
]

export type { ExternalDeckFetchResult, ExternalDeckProvider } from "@/lib/external-deck-providers/types"

export { normalizeTappedOutTxt } from "@/lib/external-deck-providers/tappedout"

export function normalizeDeckImportHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "")
}

export function findExternalDeckProvider(parsed: URL): ExternalDeckProvider | null {
  const host = normalizeDeckImportHostname(parsed.hostname)
  return EXTERNAL_DECK_PROVIDERS.find((p) => p.supportsHost(host)) ?? null
}

export async function importExternalDeckFromUrl(urlString: string): Promise<ExternalDeckFetchResult> {
  let parsed: URL
  try {
    parsed = new URL(urlString.trim())
  } catch {
    throw new Error("Invalid URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) deck links are supported")
  }
  const provider = findExternalDeckProvider(parsed)
  if (!provider) {
    const labels = EXTERNAL_DECK_PROVIDERS.map((p) => p.label).join(", ")
    throw new Error(`Unsupported deck host. Supported sources: ${labels}.`)
  }
  return provider.importFromUrl(parsed)
}
