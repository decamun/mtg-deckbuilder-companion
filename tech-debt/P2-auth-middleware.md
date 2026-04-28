# P2 · Add Server-Side Auth Middleware for `/decks` Routes

**Status:** ✅ **Resolved on `claude/mcp-tech-debt-decks-VYAtJ`.** `src/middleware.ts` redirects unauthenticated `/decks/**` requests to `/login`; the `getSession()` calls in `DecksSection.tsx` and `decks/[id]/page.tsx` were swapped to `getUser()`.

## Background

Authentication is still enforced entirely client-side: each protected page calls `supabase.auth.getSession()` and pushes back to the login screen if missing. Three concrete consequences remain:

1. A flash of unauthenticated UI on `/decks` and `/decks/[id]` before the redirect fires.
2. A full client-side render before the redirect — wasted work.
3. The `getSession()` call in client code reads from local storage only; Supabase docs recommend `getUser()` (which re-validates with the server) for any auth-gated decision.

Since this doc was written, several relevant pieces shipped or changed:

- `src/app/auth/callback/route.ts` exists and exchanges the OAuth code via the server client at `src/lib/supabase/server.ts`. ✅
- `src/lib/supabase/server.ts` provides a cookie-aware server client, so the middleware below can be wired up cleanly.
- **Architecture change:** The decks list page (`src/app/decks/page.tsx`) is now a 6-line shell that renders `<ScrollShell initialSection="decks" />`. The actual deck list logic — including the auth check — lives in `src/components/DecksSection.tsx`. File references below reflect this.

## Resolution Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — `src/middleware.ts` | ❌ Pending | File does not exist. |
| Phase 2 — Remove redundant client-side checks | ❌ Pending | Still present in `src/components/DecksSection.tsx:55-60` and `src/app/decks/[id]/page.tsx:197-198`. |
| Phase 3 — Auth callback handler | ✅ Done | `src/app/auth/callback/route.ts` redirects to `/brew` on success, `/?error=auth_callback_error` on failure. |

## Remaining Work

### Phase 1 — Create `src/middleware.ts`

> [!IMPORTANT]
> Read `node_modules/next/dist/docs/` for any Next.js 16 / `@supabase/ssr` middleware API changes before writing code.

Create `src/middleware.ts` (sibling of `src/app/`). The Supabase recipe still applies; remember to use `getUser()`, not `getSession()`, inside middleware:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/decks')) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/login'
    return NextResponse.redirect(redirect)
  }

  return response
}

export const config = {
  matcher: ['/decks/:path*'],
}
```

Notes vs. the original plan:
- Redirect target is now **`/login`**, not `/`. The unauthenticated home page is `/brew`, which is intentionally public.
- The matcher only needs `/decks/:path*`. `/brew` is public; `/login`, `/auth/*`, `/privacy`, `/terms`, `/data-deletion` are public; the MCP routes have their own auth check (see `P2-mcp-server-migration.md`).

### Phase 2 — Remove redundant client-side checks

After middleware ships, remove these blocks (RLS still protects the underlying queries):

1. `src/components/DecksSection.tsx:55-60`:
   ```ts
   const { data: session } = await supabase.auth.getSession()
   if (!session.session) {
     setIsAuthenticated(false)
     setLoading(false)
     return
   }
   ```
   (The decks list page was refactored into `DecksSection`; this is the equivalent of the old `src/app/decks/page.tsx:42-46` check. The component now renders a "Log in" prompt instead of redirecting, which is reasonable — but the `getSession()` call should still become `getUser()` per item #5 in `P4-code-quality-cleanup.md`.)

2. `src/app/decks/[id]/page.tsx:197-198`:
   ```ts
   const { data: { session } } = await supabase.auth.getSession()
   const viewerId = session?.user.id ?? null
   ```
   This currently only reads the viewer ID to determine ownership (not to redirect), so it's less security-critical. Still, swap to `getUser()` for consistency once middleware handles the redirect gate.

The `DecksSection` query at line 63 also filters by `user_id`. With RLS in place (see `supabase/migrations/20240420000000_rls_policies.sql`), that filter is redundant but harmless — leave it as defence-in-depth.

### Phase 3 — Already done

`src/app/auth/callback/route.ts` is implemented and uses the server client. The current implementation redirects to `/brew` on success rather than `/decks` (sensible since `/brew` is the new home). No work needed.

### Bonus — TopNav uses `getSession`

`src/components/TopNav.tsx:57` calls `getSession()` to populate the user dropdown. That's fine for UI hints (no security decision is made), but if the middleware route refreshes cookies, make sure `onAuthStateChange` keeps the navbar in sync. Verify after middleware lands.

## Smoke Test

1. `docker-compose up`.
2. Open an incognito window → navigate directly to `/decks` → expect immediate redirect to `/login`.
3. Navigate directly to `/decks/<uuid>` → expect immediate redirect to `/login` (no flash).
4. Sign in → land on `/brew` (post-callback) or whatever route was deep-linked.
5. Click Google sign-in (if configured) → callback → land on `/brew`.

## Files Touched

| File | Action |
|---|---|
| `src/middleware.ts` | **[NEW]** Edge middleware guarding `/decks/**` |
| `src/components/DecksSection.tsx` | Swap `getSession()` for `getUser()` in `fetchDecks` |
| `src/app/decks/[id]/page.tsx` | Swap `getSession()` for `getUser()` in `fetchDeck` |
| `src/app/auth/callback/route.ts` | Already shipped — no change |
