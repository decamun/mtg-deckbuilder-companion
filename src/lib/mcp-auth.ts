import { createClient as createSessionClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { checkRateLimit } from '@/lib/rate-limit'
import { createMcpContext, type McpContext } from '@/lib/mcp-context'

export interface McpAuthOk {
  userId: string
  context: McpContext
  /** "api_key" or "session". Lets handlers tell the two paths apart for logging. */
  mode: 'api_key' | 'session'
  apiKeyId: string | null
}

export interface McpAuthFail {
  userId: null
  context: null
  mode: 'unauthorized'
  reason: string
}

export type McpAuthResult = McpAuthOk | McpAuthFail

const KEY_PREFIX = 'idlb_'
const MCP_KEY_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 }
const MCP_INVALID_KEY_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 }

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

async function coarseIpHash(request: Request): Promise<string> {
  return sha256Hex(getClientIp(request))
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Resolve the caller of an MCP request to a user-scoped tool context.
 *
 * Priority: Authorization: Bearer idlb_... → session cookie.
 *
 * API-key auth still needs a service-role client for key lookup, but tools only
 * receive bound helper functions that apply explicit user_id ownership checks.
 */
export async function resolveMcpAuth(request: Request): Promise<McpAuthResult> {
  const ipHash = await coarseIpHash(request)
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const raw = authHeader.slice(7).trim()
    if (!raw.startsWith(KEY_PREFIX)) {
      checkRateLimit(`mcp:invalid:${ipHash}`, MCP_INVALID_KEY_RATE_LIMIT)
      return { userId: null, context: null, mode: 'unauthorized', reason: 'invalid_key' }
    }
    const hash = await sha256Hex(raw)
    const service = getServiceClient()
    const { data, error } = await service
      .from('mcp_api_keys')
      .select('id, user_id, is_active, request_count, failure_count')
      .eq('key_hash', hash)
      .maybeSingle()
    if (error || !data || !data.is_active) {
      checkRateLimit(`mcp:invalid:${ipHash}`, MCP_INVALID_KEY_RATE_LIMIT)
      return { userId: null, context: null, mode: 'unauthorized', reason: 'invalid_key' }
    }
    const rateLimit = checkRateLimit(`mcp:key:${data.id}`, MCP_KEY_RATE_LIMIT)
    if (!rateLimit.ok) {
      void service
        .from('mcp_api_keys')
        .update({
          failure_count: (data.failure_count ?? 0) + 1,
          last_coarse_ip_hash: ipHash,
        })
        .eq('id', data.id)
      return { userId: null, context: null, mode: 'unauthorized', reason: 'rate_limited' }
    }
    void service
      .from('mcp_api_keys')
      .update({
        last_used_at: new Date().toISOString(),
        request_count: (data.request_count ?? 0) + 1,
        last_coarse_ip_hash: ipHash,
      })
      .eq('id', data.id)
    return {
      userId: data.user_id,
      context: createMcpContext(service, data.user_id),
      mode: 'api_key',
      apiKeyId: data.id,
    }
  }

  // Session fallback (browser testing, in-app calls).
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { userId: null, context: null, mode: 'unauthorized', reason: 'no_session' }
  }
  return {
    userId: user.id,
    context: createMcpContext(supabase, user.id),
    mode: 'session',
    apiKeyId: null,
  }
}

/** Hash a raw API key. Exported for the key-creation route. */
export async function hashApiKey(rawKey: string): Promise<string> {
  return sha256Hex(rawKey)
}

/** Generate a new key + return both raw and hash. Raw is shown to the user once. */
export async function generateApiKey(): Promise<{ raw: string; hash: string; prefix: string }> {
  const random = crypto.randomUUID().replace(/-/g, '')
  const raw = `${KEY_PREFIX}${random}`
  const hash = await sha256Hex(raw)
  return { raw, hash, prefix: raw.slice(0, 8) }
}

export { KEY_PREFIX }
