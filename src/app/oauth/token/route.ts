import { z } from 'zod'
import {
  consumeAuthorizationCode,
  getClient,
  issueAccessToken,
  verifyPkce,
} from '@/lib/oauth-store'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TOKEN_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 }

const TokenRequest = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
})

function ipFromRequest(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function err(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    }
  )
}

/**
 * RFC 6749 §4.1.3 — Access Token Request (authorization_code grant) with
 * RFC 7636 PKCE. Public clients only; the code_verifier replaces a client
 * secret.
 *
 * Accepts both `application/x-www-form-urlencoded` (the OAuth standard) and
 * `application/json` (some MCP clients send JSON).
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`oauth-token:${ipFromRequest(request)}`, TOKEN_RATE_LIMIT)
  if (!limit.ok) {
    return err('rate_limited', 'Too many token requests from this address', 429)
  }

  const contentType = request.headers.get('content-type') ?? ''
  let payload: Record<string, unknown> = {}
  if (contentType.includes('application/json')) {
    try {
      payload = (await request.json()) as Record<string, unknown>
    } catch {
      return err('invalid_request', 'Body must be valid JSON')
    }
  } else {
    const form = await request.formData()
    for (const [k, v] of form.entries()) payload[k] = typeof v === 'string' ? v : ''
  }

  const parsed = TokenRequest.safeParse(payload)
  if (!parsed.success) return err('invalid_request', parsed.error.message)
  const body = parsed.data

  const client = await getClient(body.client_id)
  if (!client) return err('invalid_client', 'Unknown client_id', 401)

  const code = await consumeAuthorizationCode(body.code)
  if (!code) return err('invalid_grant', 'Authorization code is invalid, expired, or already used')

  if (code.client_id !== body.client_id) {
    return err('invalid_grant', 'Code was issued to a different client')
  }
  if (code.redirect_uri !== body.redirect_uri) {
    return err('invalid_grant', 'redirect_uri does not match the value used at /oauth/authorize')
  }

  const pkceOk = await verifyPkce(
    body.code_verifier,
    code.code_challenge,
    code.code_challenge_method
  )
  if (!pkceOk) return err('invalid_grant', 'PKCE verification failed')

  const issued = await issueAccessToken({
    client_id: code.client_id,
    user_id: code.user_id,
    scope: code.scope,
    resource: code.resource,
  })
  const expiresIn = Math.max(
    1,
    Math.floor((new Date(issued.expires_at).getTime() - Date.now()) / 1000)
  )

  return Response.json(
    {
      access_token: issued.raw,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: code.scope ?? undefined,
    },
    {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    }
  )
}
