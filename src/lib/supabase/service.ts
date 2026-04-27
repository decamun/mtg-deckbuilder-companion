import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Service-role Supabase client.
 *
 * Bypasses RLS — every query MUST manually filter by user_id.
 * Lazy singleton: do NOT instantiate at module scope. Build environments
 * (and unit-test runners) often lack SUPABASE_SERVICE_ROLE_KEY, and we
 * don't want module imports to throw.
 *
 * Never import this from any code path that can be bundled to the client.
 */
export function getServiceClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}
