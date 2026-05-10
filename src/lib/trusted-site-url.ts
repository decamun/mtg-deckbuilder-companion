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
 * Base URL for server-side redirects that must not trust raw `Host`.
 *
 * Priority:
 * 1. `NEXT_PUBLIC_SITE_URL` / `SITE_URL` — set on Vercel **Production** to your public
 *    domain (e.g. https://idlebrew.app).
 * 2. `VERCEL_URL` — when running on Vercel without (1), each deployment uses its own
 *    hostname (Preview + Production *.vercel.app). Enables OAuth on preview branches.
 * 3. Non-production (local): request URL origin.
 * 4. Production off-Vercel without (1): canonical product origin.
 */
export function getTrustedRedirectOrigin(request: NextRequest): URL {
  const fromEnv = envSiteOrigin()
  if (fromEnv) return new URL(fromEnv)

  const vercelHost = process.env.VERCEL_URL?.trim()
  if (process.env.VERCEL && vercelHost) {
    return new URL(`https://${vercelHost}`)
  }

  if (process.env.NODE_ENV !== 'production') {
    return new URL(request.url)
  }

  return new URL(PRODUCTION_CANONICAL_ORIGIN)
}
