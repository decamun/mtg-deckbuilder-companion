import { getBaseUrl } from '@/lib/oauth-config'

export const dynamic = 'force-dynamic'

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 *
 * Advertises just enough surface for an MCP client to discover endpoints,
 * register dynamically (RFC 7591), and run the authorization code flow with
 * PKCE.
 */
export async function GET(request: Request) {
  const issuer = getBaseUrl(request)
  const body = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp'],
  }
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
