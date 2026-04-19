# P2 · Migrate MCP Server to App Router Route Handlers

## Background

The MCP transport lives in `src/pages/api/mcp/` (legacy Pages Router). Three concrete problems:

1. **Ephemeral session state:** The `transports` Map in `sse.ts` is module-level — wiped on hot-reload or serverless restart, causing `Session not found` 404s.
2. **Wrong Supabase client:** `mcp.ts` imports the browser singleton, bypassing RLS in server context.
3. **Mixed router footprint:** `pages/` + `app/` coexisting prevents uniform middleware.

> [!IMPORTANT]
> Read `node_modules/next/dist/docs/` for App Router Route Handler API before writing code — SSE responses differ from Pages Router.

---

## Phase 1 — Fix `mcp.ts` to Accept a Supabase Client

**File:** `src/lib/mcp.ts`

1. Remove `import { supabase } from "./supabase/client"`.
2. Change the factory signature:
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js";
   export function createMcpServer(supabase: SupabaseClient) { ... }
   ```
3. All existing tool callbacks already reference `supabase` — they'll automatically use the passed-in parameter.

---

## Phase 2 — Create a Persistent Transport Store

**New file:** `src/lib/mcp-transports.ts`

```ts
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

declare global {
  var __mcpTransports: Map<string, SSEServerTransport> | undefined;
}

export function getTransports(): Map<string, SSEServerTransport> {
  if (!globalThis.__mcpTransports) {
    globalThis.__mcpTransports = new Map();
  }
  return globalThis.__mcpTransports;
}
```

Using `globalThis` makes the Map survive Next.js hot-reloads in dev.

---

## Phase 3 — Create App Router SSE Handler

**New file:** `src/app/api/mcp/sse/route.ts`

```ts
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/lib/mcp";
import { getTransports } from "@/lib/mcp-transports";
import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sessionId = crypto.randomUUID();
  const messagesPath = `/api/mcp/messages?sessionId=${sessionId}`;

  const stream = new ReadableStream({
    start(controller) {
      const transport = new SSEServerTransport(messagesPath, {
        write: (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk)),
        end: () => controller.close(),
      } as any);

      getTransports().set(sessionId, transport);
      createMcpServer(supabase).connect(transport).catch(console.error);

      request.signal.addEventListener("abort", () => {
        getTransports().delete(sessionId);
        transport.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

> [!WARNING]
> The adapter above is a starting point. Verify whether `StreamableHTTPServerTransport` is available in the installed SDK version as a cleaner App Router alternative.

---

## Phase 4 — Create App Router Messages Handler

**New file:** `src/app/api/mcp/messages/route.ts`

```ts
import { getTransports } from "@/lib/mcp-transports";
import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return new Response("Missing sessionId", { status: 400 });

  const transport = getTransports().get(sessionId);
  if (!transport) return new Response("Session not found", { status: 404 });

  await transport.handlePostMessage(request as any, new Response() as any);
  return new Response("OK");
}
```

---

## Phase 5 — Delete Old Pages Router Files

After verifying the new handlers work:

1. Delete `src/pages/api/mcp/sse.ts`
2. Delete `src/pages/api/mcp/messages.ts`
3. If `src/pages/` only contains `api/mcp/`, remove the entire `src/pages/` directory.

---

## Phase 6 — Smoke Test

1. `docker-compose up`
2. `curl -N http://localhost:3000/api/mcp/sse` while logged in — should stream SSE events.
3. Verify `get_decklist` tool works end-to-end via an MCP client.
4. Hot-reload the server — verify sessions fail gracefully rather than hanging.
5. Attempt `/api/mcp/sse` without a session cookie — expect `401 Unauthorized`.

---

## Files Changed

| File | Action |
|---|---|
| `src/lib/mcp.ts` | Accept `SupabaseClient` param; remove browser singleton import |
| `src/lib/mcp-transports.ts` | **[NEW]** `globalThis`-backed transport store |
| `src/app/api/mcp/sse/route.ts` | **[NEW]** App Router SSE handler |
| `src/app/api/mcp/messages/route.ts` | **[NEW]** App Router POST handler |
| `src/pages/api/mcp/sse.ts` | **[DELETE]** after verification |
| `src/pages/api/mcp/messages.ts` | **[DELETE]** after verification |
