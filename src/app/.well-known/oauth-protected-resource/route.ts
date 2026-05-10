import { getBaseUrl, MCP_RESOURCE_PATH } from '@/lib/oauth-config'

export const dynamic = 'force-dynamic'

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Tells MCP clients which authorization server protects the MCP endpoint and
 * which bearer token scheme is in use.
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
