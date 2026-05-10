import { getBaseUrl, MCP_RESOURCE_PATH } from '@/lib/oauth-config'

export const dynamic = 'force-dynamic'

/**
 * RFC 9728 specifies that a protected resource at /api/mcp also publishes its
 * metadata at /.well-known/oauth-protected-resource/api/mcp. MCP clients tend
 * to query this path-scoped variant first; mirror it from the root document.
 */
export async function GET(request: Request) {
  const base = getBaseUrl(request)
  const body = {
    resource: `${base}${MCP_RESOURCE_PATH}`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
    resource_name: 'idlebrew MCP',
  }
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
