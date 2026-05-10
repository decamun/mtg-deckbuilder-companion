import { z } from 'zod'
import { registerClient } from '@/lib/oauth-store'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const REGISTRATION_RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 }

const RegisterRequest = z.object({
  client_name: z.string().min(1).max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(8),
  // Accepted but ignored fields per RFC 7591; we always issue public clients
  // with PKCE-required token endpoint auth.
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
})

function ipFromRequest(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * RFC 7591 — OAuth Dynamic Client Registration.
 *
 * Creates a public client with PKCE-required auth. The MCP client supplies
 * its redirect_uris (typically a localhost callback for desktop apps); we
 * mint a random client_id and return the registration response.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`oauth-register:${ipFromRequest(request)}`, REGISTRATION_RATE_LIMIT)
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', error_description: 'Too many registrations from this address' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json(
      { error: 'invalid_request', error_description: 'Body must be JSON' },
      { status: 400 }
    )
  }

  const parsed = RegisterRequest.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', error_description: parsed.error.message },
      { status: 400 }
    )
  }

  const client = await registerClient(
    parsed.data.client_name ?? null,
    parsed.data.redirect_uris
  )

  return Response.json(
    {
      client_id: client.client_id,
      client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
      client_name: client.client_name ?? undefined,
      redirect_uris: client.redirect_uris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201 }
  )
}
