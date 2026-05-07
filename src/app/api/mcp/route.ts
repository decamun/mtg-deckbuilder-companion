import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp'
import { resolveMcpAuth } from '@/lib/mcp-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * MCP endpoint. The Streamable HTTP transport handles GET/POST/DELETE on a
 * single URL. Session is stateless — each call gets its own transport bound
 * to a fresh server instance scoped to the authenticated user.
 *
 * Auth precedence:
 *   1. Authorization: Bearer idlb_... (API-key, service-role client)
 *   2. Supabase session cookie (browser, RLS active)
 */
async function handle(request: Request): Promise<Response> {
  const auth = await resolveMcpAuth(request)
  if (auth.userId === null) {
    const status = auth.reason === 'rate_limited' ? 429 : 401
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const server = createMcpServer(auth.context)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no cross-request session affinity required because each
    // request rebuilds the server. Scales horizontally without shared state.
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
