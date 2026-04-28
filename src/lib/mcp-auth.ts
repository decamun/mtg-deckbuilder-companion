import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'

export interface McpAuthOk {
  userId: string
  supabase: SupabaseClient
  /** "api_key" or "session". Lets handlers tell the two paths apart for logging. */
  mode: 'api_key' | 'session'
}

export interface McpAuthFail {
  userId: null
  supabase: null
  mode: 'unauthorized'
  reason: string
}

export type McpAuthResult = McpAuthOk | McpAuthFail

const KEY_PREFIX = 'idlb_'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Resolve the caller of an MCP request to a userId + Supabase client.
 *
 * Priority: Authorization: Bearer idlb_... → session cookie.
 *
 * On API-key auth the returned client is the service-role client (RLS bypassed).
 * Tools must filter by user_id manually — the deck-service helpers do this.
 *
 * On session auth the returned client is the cookie-aware server client.
 */
export async function resolveMcpAuth(request: Request): Promise<McpAuthResult> {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const raw = authHeader.slice(7).trim()
    if (!raw.startsWith(KEY_PREFIX)) {
      return { userId: null, supabase: null, mode: 'unauthorized', reason: 'invalid_key_format' }
    }
    const hash = await sha256Hex(raw)
    const service = getServiceClient()
    const { data, error } = await service
      .from('mcp_api_keys')
      .select('id, user_id, is_active')
      .eq('key_hash', hash)
      .maybeSingle()
    if (error || !data || !data.is_active) {
      return { userId: null, supabase: null, mode: 'unauthorized', reason: 'invalid_key' }
    }
    // Fire-and-forget: update last_used_at.
    void service
      .from('mcp_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
    return { userId: data.user_id, supabase: service, mode: 'api_key' }
  }

  // Session fallback (browser testing, in-app calls).
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { userId: null, supabase: null, mode: 'unauthorized', reason: 'no_session' }
  }
  return { userId: user.id, supabase, mode: 'session' }
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
