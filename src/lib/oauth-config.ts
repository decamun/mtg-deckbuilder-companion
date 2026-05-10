/**
 * Build the canonical base URL of this server. Used as the OAuth issuer and as
 * the resource identifier in metadata documents.
 *
 * Honors NEXT_PUBLIC_APP_URL when set (production deployments), otherwise
 * derives from the incoming request, taking proxy headers into account so the
 * advertised issuer matches what the client actually saw.
 */
export function getBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const host = forwardedHost ?? url.host
  const proto = forwardedProto ?? url.protocol.replace(':', '')
  return `${proto}://${host}`
}

export const MCP_RESOURCE_PATH = '/api/mcp'
