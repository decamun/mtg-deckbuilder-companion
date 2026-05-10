/**
 * OAuth 2.1 store for MCP authorization. All secrets (auth codes, access
 * tokens) are hashed with SHA-256 before persistence; raw values are returned
 * to the caller exactly once at issue time.
 *
 * All operations use the service-role client because the OAuth flow runs in
 * route handlers that need to issue/verify tokens regardless of a session.
 */
import { getServiceClient } from '@/lib/supabase/service'

const AUTH_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export const TOKEN_PREFIX = 'idlboat_' // idlebrew-oauth-access-token
const CODE_PREFIX = 'idlboac_' // idlebrew-oauth-auth-code

export interface OAuthClient {
  client_id: string
  client_name: string | null
  redirect_uris: string[]
  created_at: string
}

export interface AuthCodeRecord {
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scope: string | null
  resource: string | null
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomToken(prefix: string, bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}${hex}`
}

// ─── Client registration ────────────────────────────────────────────────────

export async function registerClient(
  clientName: string | null,
  redirectUris: string[]
): Promise<OAuthClient> {
  const service = getServiceClient()
  const client_id = randomToken('idlbocid_', 16)
  const { data, error } = await service
    .from('oauth_clients')
    .insert({
      client_id,
      client_name: clientName,
      redirect_uris: redirectUris,
    })
    .select('client_id, client_name, redirect_uris, created_at')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to register client')
  return data as OAuthClient
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const service = getServiceClient()
  const { data, error } = await service
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris, created_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as OAuthClient | null) ?? null
}

// ─── Authorization codes ────────────────────────────────────────────────────

/** Issue an authorization code. Returns the raw code (only shown once). */
export async function issueAuthorizationCode(record: AuthCodeRecord): Promise<string> {
  const raw = randomToken(CODE_PREFIX)
  const code_hash = await sha256Hex(raw)
  const expires_at = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString()
  const service = getServiceClient()
  const { error } = await service.from('oauth_authorization_codes').insert({
    code_hash,
    client_id: record.client_id,
    user_id: record.user_id,
    redirect_uri: record.redirect_uri,
    code_challenge: record.code_challenge,
    code_challenge_method: record.code_challenge_method,
    scope: record.scope,
    resource: record.resource,
    expires_at,
  })
  if (error) throw new Error(error.message)
  return raw
}

/**
 * Exchange a code for its stored record. Marks the code used (single-use). The
 * caller must verify the PKCE code_verifier against the returned challenge.
 *
 * Returns null if the code is unknown, expired, or already used.
 */
export async function consumeAuthorizationCode(rawCode: string): Promise<
  (AuthCodeRecord & { expires_at: string }) | null
> {
  const code_hash = await sha256Hex(rawCode)
  const service = getServiceClient()
  // Use update-then-select to atomically claim the code: the WHERE clause
  // ensures only an unused, unexpired row matches.
  const nowIso = new Date().toISOString()
  const { data, error } = await service
    .from('oauth_authorization_codes')
    .update({ used_at: nowIso })
    .eq('code_hash', code_hash)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select(
      'client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at'
    )
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as (AuthCodeRecord & { expires_at: string }) | null) ?? null
}

// ─── Access tokens ──────────────────────────────────────────────────────────

export interface IssuedAccessToken {
  raw: string
  expires_at: string
}

export async function issueAccessToken(args: {
  client_id: string
  user_id: string
  scope: string | null
  resource: string | null
}): Promise<IssuedAccessToken> {
  const raw = randomToken(TOKEN_PREFIX)
  const token_hash = await sha256Hex(raw)
  const expires_at = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString()
  const service = getServiceClient()
  const { error } = await service.from('oauth_access_tokens').insert({
    token_hash,
    client_id: args.client_id,
    user_id: args.user_id,
    scope: args.scope,
    resource: args.resource,
    expires_at,
  })
  if (error) throw new Error(error.message)
  return { raw, expires_at }
}

export interface ResolvedAccessToken {
  token_hash: string
  client_id: string
  user_id: string
  expires_at: string
}

export async function resolveAccessToken(rawToken: string): Promise<ResolvedAccessToken | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null
  const token_hash = await sha256Hex(rawToken)
  const service = getServiceClient()
  const { data, error } = await service
    .from('oauth_access_tokens')
    .select('token_hash, client_id, user_id, expires_at, revoked_at')
    .eq('token_hash', token_hash)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  // Fire-and-forget last_used update.
  void service
    .from('oauth_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token_hash', token_hash)
  return {
    token_hash: data.token_hash,
    client_id: data.client_id,
    user_id: data.user_id,
    expires_at: data.expires_at,
  }
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

/**
 * Verify a PKCE code_verifier against a stored challenge. Only S256 is
 * supported here; "plain" is rejected per OAuth 2.1.
 */
export async function verifyPkce(
  codeVerifier: string,
  storedChallenge: string,
  method: string
): Promise<boolean> {
  if (method !== 'S256') return false
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const b64 = Buffer.from(buf).toString('base64')
  const computed = b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return timingSafeEqual(computed, storedChallenge)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let acc = 0
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return acc === 0
}
