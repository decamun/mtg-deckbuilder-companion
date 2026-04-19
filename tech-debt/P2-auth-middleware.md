# P2 · Add Server-Side Auth Middleware for `/decks` Routes

## Background

Currently, authentication is enforced entirely client-side inside `fetchDecks()` in `src/app/decks/page.tsx`. This causes:

1. A flash of unauthenticated UI (the deck grid renders before the redirect fires).
2. A full client-side render before the redirect — wasted work.
3. No protection for any sub-routes like `/decks/[id]` — an unauthenticated user who navigates directly to a deck URL will see the loading state until Supabase resolves, then… nothing (the deck data query silently fails).

Next.js middleware runs at the edge **before** the page renders, enabling a clean server-side redirect.

---

## Phase 1 — Create `middleware.ts`

**File to create:** `src/middleware.ts` (at the `src/` root, next to `app/`)

> [!IMPORTANT]
> Read `node_modules/next/dist/docs/` for any middleware API changes before writing code. The `@supabase/ssr` middleware pattern may differ from training data.

### Steps

1. Create `src/middleware.ts` with the following pattern:

   ```ts
   import { createServerClient } from '@supabase/ssr'
   import { NextResponse } from 'next/server'
   import type { NextRequest } from 'next/server'

   export async function middleware(request: NextRequest) {
     let supabaseResponse = NextResponse.next({ request })

     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return request.cookies.getAll()
           },
           setAll(cookiesToSet) {
             cookiesToSet.forEach(({ name, value }) =>
               request.cookies.set(name, value)
             )
             supabaseResponse = NextResponse.next({ request })
             cookiesToSet.forEach(({ name, value, options }) =>
               supabaseResponse.cookies.set(name, value, options)
             )
           },
         },
       }
     )

     // Refresh session — important: do NOT call supabase.auth.getSession() here,
     // use getUser() which re-validates with the server.
     const { data: { user } } = await supabase.auth.getUser()

     if (!user && request.nextUrl.pathname.startsWith('/decks')) {
       const redirectUrl = request.nextUrl.clone()
       redirectUrl.pathname = '/'
       return NextResponse.redirect(redirectUrl)
     }

     return supabaseResponse
   }

   export const config = {
     matcher: [
       // Match /decks and all sub-paths. Exclude Next.js internals and static files.
       '/decks/:path*',
     ],
   }
   ```

2. Verify the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars are set in `.env.local` (they should already be — check against `docker-compose.yml` env section).

---

## Phase 2 — Remove the Redundant Client-Side Auth Check

**File to edit:** `src/app/decks/page.tsx`

Now that middleware handles the redirect, the client-side session check inside `fetchDecks` is redundant and adds a round-trip.

1. Remove these lines from `fetchDecks`:
   ```ts
   const { data: session } = await supabase.auth.getSession()
   if (!session.session) {
     router.push('/')
     return
   }
   ```

2. The Supabase query below it (`supabase.from('decks').select(...)`) is protected by RLS — if somehow an unauthenticated request slips through, it will return an empty array (RLS will filter all rows), which is a safe fallback.

---

## Phase 3 — Add an Auth Callback Route Handler

Supabase OAuth and email-link flows redirect back to `/auth/callback`. Without a handler, users land on a 404. This is referenced in `page.tsx` (`redirectTo: .../auth/callback`) but the route doesn't exist yet.

**File to create:** `src/app/auth/callback/route.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/decks`)
    }
  }

  // Auth failed — redirect back to login with an error
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`)
}
```

---

## Phase 4 — Smoke Test

1. Start containers: `docker-compose up`
2. Open an incognito window and navigate directly to `/decks` — verify you are immediately redirected to `/`.
3. Navigate directly to `/decks/some-uuid` — verify you are immediately redirected to `/`.
4. Sign in with valid credentials — verify you land on `/decks` with **no flash of the unauthenticated view**.
5. (If Google OAuth is configured) Click Google sign-in — verify the redirect to `/auth/callback` resolves to `/decks`.

---

## Files Changed

| File | Action |
|---|---|
| `src/middleware.ts` | **[NEW]** Edge middleware guarding `/decks/**` |
| `src/app/auth/callback/route.ts` | **[NEW]** OAuth/email-link code exchange handler |
| `src/app/decks/page.tsx` | Remove client-side session check from `fetchDecks` |
