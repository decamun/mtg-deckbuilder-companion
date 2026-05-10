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
 * Origin implied by the edge / platform (Vercel sets these — not spoofable like `Host`).
 * Matches Supabase SSR Auth examples that use `x-forwarded-host`.
 */
function forwardedOrigin(request: NextRequest): URL | null {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (!host) return null
  const protoHeader = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto =
    protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https'
  try {
    return new URL(`${proto}://${host}`)
  } catch {
    return null
  }
}

/**
 * Base URL for server-side redirects after OAuth code exchange (must match the
 * same host the browser used for `/auth/callback` so session cookies apply).
 *
 * Priority:
 * 1. `NEXT_PUBLIC_SITE_URL` / `SITE_URL` — production custom domain.
 * 2. `x-forwarded-host` + `x-forwarded-proto` — preview / deployment hostname from the edge.
 * 3. Non-production: request URL origin (local dev).
 * 4. Production off-edge without (1)/(2): canonical product origin.
 *
 * We intentionally do **not** use deployment hostname env vars or the Supabase API
 * origin here: sessions are bound to the app origin that served `/auth/callback`.
 * sessions are bound to the app origin that served `/auth/callback`, not the API host.
 */
export function getTrustedRedirectOrigin(request: NextRequest): URL {
  const fromEnv = envSiteOrigin()
  if (fromEnv) return new URL(fromEnv)

  const xf = forwardedOrigin(request)
  if (xf) return xf

  if (process.env.NODE_ENV !== 'production') {
    return new URL(request.url)
  }

  return new URL(PRODUCTION_CANONICAL_ORIGIN)
}
