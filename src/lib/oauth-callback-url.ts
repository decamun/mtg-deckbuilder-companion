/**
 * URLs passed as Supabase `redirectTo` / email `redirectTo`. Must match Dashboard →
 * Authentication → Redirect URLs.
 *
 * IdPs register only `https://<ref>.supabase.co/auth/v1/callback` with Google/Facebook.
 * App paths like `/auth/callback` are allowlisted in Supabase only (wildcards OK).
 *
 * **NEXT_PUBLIC_AUTH_CALLBACK_URL** — optional full URL override for OAuth callback only.
 */

function oauthCallbackOverride(): string | null {
  const full = process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL?.trim()
  return full || null
}

export function getOAuthCallbackUrl(): string {
  const override = oauthCallbackOverride()
  if (override) return override

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (site) {
    try {
      return new URL('/auth/callback', site).toString()
    } catch {
      /* fall through */
    }
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3000/auth/callback'
  }

  return `${window.location.origin}/auth/callback`
}

export function getPasswordResetRedirectUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (site) {
    try {
      return new URL('/auth/reset-password', site).toString()
    } catch {
      /* fall through */
    }
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3000/auth/reset-password'
  }

  return `${window.location.origin}/auth/reset-password`
}
