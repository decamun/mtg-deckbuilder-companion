# P2 · Migrate MCP Server to App Router Route Handlers

**Status:** ❌ Not started — every phase still applies.

## Background

The MCP transport still lives in `src/pages/api/mcp/` (legacy Pages Router). The same three problems hold:

1. **Ephemeral session state.** `src/pages/api/mcp/sse.ts:5` declares `transports = new Map(...)` at module scope. It's wiped on hot-reload or any serverless restart, causing `Session not found` 404s from `src/pages/api/mcp/messages.ts:18`.
2. **Wrong Supabase client.** `src/lib/mcp.ts:3` still imports the **browser** singleton from `./supabase/client`. In the API context we need a cookie-aware server client (now available at `src/lib/supabase/server.ts`) so RLS receives the caller's identity.
3. **Mixed router footprint.** `src/pages/` only contains `api/mcp/*` — every other route already lives in `src/app/`. The split prevents uniform middleware (see `P2-auth-middleware.md`).

Since this doc was written, two enabling pieces landed:

- `src/lib/supabase/server.ts` — cookie-aware server client. Phase 1 below now has a concrete dependency to wire up.
- A new MCP tool, `add_card`, was added to `src/lib/mcp.ts:29`. Plan still applies — the tool body just calls `supabase`, which will be the injected server client.

> [!IMPORTANT]
> Read `node_modules/next/dist/docs/` for the App Router Route Handler API and SSE specifics in Next.js 16 before writing code. Also check whether `@modelcontextprotocol/sdk` >= 1.29 (currently installed) ships `StreamableHTTPServerTransport` — it's a cleaner fit for App Router than the SSE adapter shown here.

## Phase 1 — Inject Supabase Client into `createMcpServer`

**File:** `src/lib/mcp.ts`

1. Remove `import { supabase } from "./supabase/client"`.
2. Change the factory signature:
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js"
   export function createMcpServer(supabase: SupabaseClient) { … }
   ```
3. The three existing tools (`search_scryfall`, `add_card`, `get_decklist`) already reference `supabase` by name — they'll bind to the parameter automatically.

## Phase 2 — Persistent Transport Store

**New file:** `src/lib/mcp-transports.ts`

```ts
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"

declare global {
  // eslint-disable-next-line no-var
  var __mcpTransports: Map<string, SSEServerTransport> | undefined
}

export function getTransports(): Map<string, SSEServerTransport> {
  if (!globalThis.__mcpTransports) globalThis.__mcpTransports = new Map()
  return globalThis.__mcpTransports
}
```

`globalThis` survives hot-reload. (In serverless this still resets per cold-start — fine, the client just reconnects.)

## Phase 3 — App Router SSE Handler

**New file:** `src/app/api/mcp/sse/route.ts`

```ts
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { createMcpServer } from "@/lib/mcp"
import { getTransports } from "@/lib/mcp-transports"
import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const sessionId = crypto.randomUUID()
  const messagesPath = `/api/mcp/messages?sessionId=${sessionId}`

  const stream = new ReadableStream({
    start(controller) {
      const transport = new SSEServerTransport(messagesPath, {
        write: (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk)),
        end: () => controller.close(),
      } as unknown as Parameters<typeof SSEServerTransport>[1])

      getTransports().set(sessionId, transport)
      createMcpServer(supabase).connect(transport).catch(console.error)

      request.signal.addEventListener("abort", () => {
        getTransports().delete(sessionId)
        transport.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
```

> [!WARNING]
> The `as unknown as ...` cast is the price of adapting Node's `ServerResponse`-shaped API to a Web `ReadableStream`. If `StreamableHTTPServerTransport` exists in the installed SDK version, prefer it and delete this adapter.

## Phase 4 — App Router Messages Handler

**New file:** `src/app/api/mcp/messages/route.ts`

```ts
import { getTransports } from "@/lib/mcp-transports"
import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const sessionId = request.nextUrl.searchParams.get("sessionId")
  if (!sessionId) return new Response("Missing sessionId", { status: 400 })

  const transport = getTransports().get(sessionId)
  if (!transport) return new Response("Session not found", { status: 404 })

  await transport.handlePostMessage(
    request as unknown as Parameters<typeof transport.handlePostMessage>[0],
    new Response() as unknown as Parameters<typeof transport.handlePostMessage>[1]
  )
  return new Response("OK")
}
```

## Phase 5 — Delete Old Pages Router Files

After verifying the new handlers:

1. Delete `src/pages/api/mcp/sse.ts`
2. Delete `src/pages/api/mcp/messages.ts`
3. The `src/pages/` tree only contains `api/mcp/` today — remove the empty `src/pages/` directory entirely.

This unblocks edge middleware running over the whole app.

## Phase 6 — Smoke Test

1. `docker-compose up`.
2. `curl -N http://localhost:3000/api/mcp/sse` while signed in (cookie attached) — confirm an SSE stream opens.
3. Use an MCP client to invoke `get_decklist` and `add_card` end-to-end.
4. Hot-reload the dev server — open a fresh SSE connection and confirm session creation succeeds.
5. Hit `/api/mcp/sse` without a session cookie — expect `401 Unauthorized`.

## Files Touched

| File | Action |
|---|---|
| `src/lib/mcp.ts` | Accept `SupabaseClient` param; drop browser-singleton import |
| `src/lib/mcp-transports.ts` | **[NEW]** `globalThis`-backed transport store |
| `src/app/api/mcp/sse/route.ts` | **[NEW]** App Router SSE handler |
| `src/app/api/mcp/messages/route.ts` | **[NEW]** App Router POST handler |
| `src/pages/api/mcp/sse.ts` | **[DELETE]** after verification |
| `src/pages/api/mcp/messages.ts` | **[DELETE]** after verification |
| `src/pages/` | **[DELETE]** empty directory |
