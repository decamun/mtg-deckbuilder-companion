import type { NextRequest } from 'next/server'

/**
 * Production fallback when NEXT_PUBLIC_SITE_URL / SITE_URL are unset.
 * Keeps OAuth redirects on the real domain instead of the Host header.
 */
const PRODUCTION_CANONICAL_ORIGIN = 'https://idlebrew.app'

function envSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL
  if (!raw?.trim()) return null
  try {
    return new URL(raw.trim()).origin
  } catch {
    return null
  }
}

/**
 * Base URL for server-side redirects that must not trust `Host`.
 * - Production: env origin, else canonical product origin.
 * - Development: request URL origin (localhost / preview).
 */
export function getTrustedRedirectOrigin(request: NextRequest): URL {
  const fromEnv = envSiteOrigin()
  if (fromEnv) return new URL(fromEnv)

  if (process.env.NODE_ENV !== 'production') {
    return new URL(request.url)
  }

  return new URL(PRODUCTION_CANONICAL_ORIGIN)
}
