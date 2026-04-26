# MCP API Integration — Implementation Plan

**Branch:** `claude/mcp-api-integration-Z77S6`  
**Status:** Ready to implement — all planning complete, no code written yet.

## What This Is

Build a production-ready MCP (Model Context Protocol) server so that Claude, Gemini, and ChatGPT agents can authenticate and access the user's deckbuilder data programmatically. The goal is eventual full feature parity with the web app. This plan covers the **core stack only**: protocol, auth, and key registration. Individual tools will be expanded in a follow-on.

This work also resolves three pre-existing bugs documented in `tech-debt/P2-mcp-server-migration.md` — that file is superseded by this plan.

---

## Environment Setup for Testing

This work is designed for the **custom Docker + Supabase cloud environment**. When your session starts, the setup script will have already:
- Started the Docker daemon
- Run `supabase start` (local Supabase on port 54321, Studio on 54323)
- Run `docker compose up -d` (Next.js app on port 3000)

All commands in this doc assume that environment. Key endpoints:
- App: `http://localhost:3000`
- Supabase API: `http://localhost:54321`
- Supabase Studio: `http://localhost:54323`

---

## New Environment Variable Required

Add `SUPABASE_SERVICE_ROLE_KEY` everywhere the app is configured:

| File | Where to add |
|------|-------------|
| `.env.example` | New entry with comment |
| `docker-compose.yml` | `web.environment` block |
| `docker-compose.agent.yml` | `web.environment` block |

Get the local dev value from: `supabase status | grep 'service_role key'`  
Or from Studio → Settings → API.

---

## Step 1 — Database Migration

**New file:** `supabase/migrations/20240421000000_mcp_api_keys.sql`

```sql
CREATE TABLE public.mcp_api_keys (
  id            uuid         NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text         NOT NULL,
  key_hash      text         NOT NULL UNIQUE,   -- SHA-256 hex of the raw key
  key_prefix    text         NOT NULL,          -- first 8 chars, display only
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  is_active     boolean      NOT NULL DEFAULT true,
  CONSTRAINT mcp_api_keys_pkey PRIMARY KEY (id)
);

CREATE INDEX mcp_api_keys_key_hash_idx ON public.mcp_api_keys (key_hash);

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own api keys" ON public.mcp_api_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Key format: `idlb_` + 32 hex chars. Only shown once at creation; only the SHA-256 hash is persisted.

Apply with:
```bash
supabase db push
```

---

## Step 2 — Service Role Supabase Client

**New file:** `src/lib/supabase/service.ts`

Lazy singleton — **do NOT instantiate at module scope** (breaks CI builds where the env var is absent):

```ts
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getServiceClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}
```

- Bypasses RLS — every query using this client **must** manually add `.eq('user_id', userId)`
- Never import from any file that can be bundled client-side

---

## Step 3 — API Key Management REST Endpoints

Session-authenticated (cookie session) — for the web app user, not AI agents.

### `src/app/api/keys/route.ts`

**POST** — create a key:
1. `supabase.auth.getUser()` → 401 if no session
2. Parse `{ name: string }` → 400 if blank
3. Generate: `const rawKey = "idlb_" + crypto.randomUUID().replace(/-/g, "")`
4. SHA-256 hash via `crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey))`
5. Insert `{ user_id, name, key_hash, key_prefix: rawKey.slice(0, 8) }`
6. Return `201 { id, name, key_prefix, created_at, key: rawKey }` — **only time the raw key is returned**

**GET** — list keys:
- Select `id, name, key_prefix, created_at, last_used_at, is_active` — never `key_hash`

### `src/app/api/keys/[id]/route.ts`

**DELETE** — revoke:
- `.delete().eq('id', id).eq('user_id', user.id)` — double-scoped to block cross-user deletion
- Return `204`; `404` if nothing deleted (deliberately ambiguous to prevent enumeration)

---

## Step 4 — MCP Transport Store

**New file:** `src/lib/mcp-transports.ts`

```ts
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"

declare global { var __mcpTransports: Map<string, SSEServerTransport> | undefined }

export function getTransports() {
  globalThis.__mcpTransports ??= new Map()
  return globalThis.__mcpTransports
}
```

`globalThis` survives Next.js hot-reload; a module-scope `Map` does not.

---

## Step 5 — Auth Helper

**New file:** `src/lib/mcp-auth.ts`

Returns `{ userId: string, supabaseClient }` or `{ userId: null, supabaseClient: null }`.

**Mode A — API key** (`Authorization: Bearer idlb_...`):
1. Reject if header absent or key doesn't start with `idlb_`
2. SHA-256 hash the key; look up `key_hash` in `mcp_api_keys` via service client
3. Return 401 if not found or `is_active = false`
4. Fire-and-forget `UPDATE last_used_at = now()`
5. Return `{ userId: keyRow.user_id, supabaseClient: serviceClient }`

**Mode B — Session** (fallback for browser testing):
1. `createServerClient()` + `supabase.auth.getUser()`
2. Return `{ userId: user.id, supabaseClient }` with the session-scoped client

The service client in Mode A bypasses RLS — all tool implementations must add `.eq('user_id', userId)`.

---

## Step 6 — MCP Server Update

**Modify:** `src/lib/mcp.ts`

- Remove `import { supabase } from "./supabase/client"`
- Change signature: `createMcpServer(supabase: SupabaseClient, userId: string)`
- All tool callbacks use the passed-in `supabase` and close over `userId`
- `get_decklist` and `add_card`: add a deck ownership pre-check before touching `deck_cards`

**5 tools for this phase** (`search_scryfall` unchanged except error typing):

| Tool | What it does |
|------|-------------|
| `search_scryfall(query)` | Queries Scryfall, returns top results |
| `list_decks()` | All user's decks — id, name, format, created_at |
| `get_deck(deck_id)` | Deck metadata — name, format, description, commanders |
| `get_decklist(deck_id)` | All cards in deck with quantity and zone |
| `add_card(deck_id, scryfall_id, name, quantity)` | Inserts card after ownership check |

---

## Step 7 — App Router MCP Routes

Both routes go in `src/app/api/mcp/` (App Router), replacing the legacy `src/pages/api/mcp/` files.

### `src/app/api/mcp/sse/route.ts`

```
GET:
1. resolveMcpAuth(request)  →  401 if no auth
2. createMcpServer(supabaseClient, userId)
3. sessionId = crypto.randomUUID()
4. Build ReadableStream; fakeRes shim writes to controller.enqueue()
5. new SSEServerTransport(`/api/mcp/messages?sessionId=${sessionId}`, fakeRes as any)
6. getTransports().set(sessionId, transport)
7. mcpServer.connect(transport)
8. request.signal 'abort' → getTransports().delete + transport.close()
9. return new Response(stream, SSE headers + 'X-Accel-Buffering: no')
```

> **Check first:** inspect `node_modules/@modelcontextprotocol/sdk/dist/` for `StreamableHTTPServerTransport`. If it exists, prefer it — it's designed for App Router and avoids the fakeRes shim entirely.

### `src/app/api/mcp/messages/route.ts`

```
POST:
1. sessionId from query params  →  400 if missing
2. getTransports().get(sessionId)  →  404 if missing (not 401 — sessionId is a capability token)
3. Read raw body; build fakeReq/fakeRes shims
4. transport.handlePostMessage(fakeReq, fakeRes)
5. Return accumulated response
```

Add `export const dynamic = 'force-dynamic'` to prevent body caching.

> **Check first:** inspect `SSEServerTransport.handlePostMessage` in the SDK source to understand exactly what it reads from `req` and writes to `res` before writing the shim.

---

## Step 8 — Delete Legacy Pages Router Files

After smoke tests pass:
```bash
# Verify no other files remain
ls src/pages/

# Delete
rm src/pages/api/mcp/sse.ts
rm src/pages/api/mcp/messages.ts
rmdir src/pages/api/mcp src/pages/api src/pages
```

---

## Files to Create / Modify / Delete

| Action | Path |
|--------|------|
| **New** | `supabase/migrations/20240421000000_mcp_api_keys.sql` |
| **New** | `src/lib/supabase/service.ts` |
| **New** | `src/lib/mcp-transports.ts` |
| **New** | `src/lib/mcp-auth.ts` |
| **New** | `src/app/api/keys/route.ts` |
| **New** | `src/app/api/keys/[id]/route.ts` |
| **New** | `src/app/api/mcp/sse/route.ts` |
| **New** | `src/app/api/mcp/messages/route.ts` |
| **Modify** | `src/lib/mcp.ts` |
| **Modify** | `.env.example` |
| **Modify** | `docker-compose.yml` |
| **Modify** | `docker-compose.agent.yml` |
| **Delete** | `src/pages/api/mcp/sse.ts` |
| **Delete** | `src/pages/api/mcp/messages.ts` |
| **Delete** | `src/pages/` (entire dir, now empty) |

---

## Verification (Custom Docker + Supabase Environment)

### 1. Apply migration
```bash
supabase db push
```
Confirm in Studio (`http://localhost:54323`) → Table Editor → `mcp_api_keys` exists.

### 2. TypeScript check
```bash
docker compose exec web npx tsc --noEmit
```

### 3. Key management endpoints
```bash
# You need a session cookie — sign into http://localhost:3000 first, then grab it from DevTools

# Create a key
curl -s -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"name":"Smoke test"}' | jq .
# Expected: { id, name, key_prefix, created_at, key: "idlb_..." }

# List keys — key field must NOT appear
curl -s http://localhost:3000/api/keys -H "Cookie: <session>" | jq .

# Delete
curl -s -X DELETE http://localhost:3000/api/keys/<id> -H "Cookie: <session>"
# Expected: 204

# Unauthenticated create — must 401
curl -s -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" -d '{"name":"x"}' | jq .message
```

### 4. MCP endpoint auth
```bash
# No auth → 401
curl -I http://localhost:3000/api/mcp/sse
# → HTTP/1.1 401

# Valid API key → SSE stream opens
KEY="idlb_..."   # from the create response above
curl -N -H "Authorization: Bearer $KEY" http://localhost:3000/api/mcp/sse
# → event:endpoint data:... stream

# Invalid key → 401
curl -I -H "Authorization: Bearer idlb_fakefakefake" http://localhost:3000/api/mcp/sse
# → HTTP/1.1 401

# Browser session → SSE stream opens
curl -N -H "Cookie: <session>" http://localhost:3000/api/mcp/sse
# → event:endpoint data:... stream
```

### 5. Confirm last_used_at updates
After any MCP interaction with the key:
```bash
curl -s http://localhost:3000/api/keys -H "Cookie: <session>" \
  | jq '.[0].last_used_at'
# → recent ISO timestamp, not null
```

---

## Out of Scope (This Phase)

- UI for API key management
- Full tool parity — remaining operations (create deck, delete card, set commanders, import decklist, update zone/tags) are next phase
- Rate limiting
- Key expiry / rotation
- Audit log for tool invocations
- Multi-instance scaling (`globalThis` Map is single-process — needs Redis for horizontal scale)
- `src/middleware.ts` for `/decks` route protection (tracked separately in `tech-debt/P2-auth-middleware.md`)
