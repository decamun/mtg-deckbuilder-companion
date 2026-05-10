import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp'
import { resolveMcpAuth } from '@/lib/mcp-auth'
import { getBaseUrl } from '@/lib/oauth-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * MCP endpoint. The Streamable HTTP transport handles GET/POST/DELETE on a
 * single URL. Session is stateless — each call gets its own transport bound
 * to a fresh server instance scoped to the authenticated user.
 *
 * Auth precedence:
 *   1. Authorization: Bearer idlb_*    — API key (CLI / Claude Code)
 *   2. Authorization: Bearer idlboat_* — OAuth access token (Claude Desktop / Cursor)
 *   3. Supabase session cookie         — browser
 *
 * On 401, advertises the OAuth protected resource metadata URL so MCP clients
 * can run dynamic client registration and the auth-code+PKCE flow per the MCP
 * Authorization spec (RFC 9728 + RFC 7591 + RFC 6749).
 */
async function handle(request: Request): Promise<Response> {
  const auth = await resolveMcpAuth(request)
  if (auth.userId === null) {
    const status = auth.reason === 'rate_limited' ? 429 : 401
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (status === 401) {
      const base = getBaseUrl(request)
      const resourceMetadata = `${base}/.well-known/oauth-protected-resource/api/mcp`
      headers['WWW-Authenticate'] =
        `Bearer realm="idlebrew", resource_metadata="${resourceMetadata}"`
    }
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status,
      headers,
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
