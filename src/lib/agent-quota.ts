import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Model ids use the Vercel AI Gateway naming convention: `provider/model`.
 * The gateway forwards requests to the underlying provider and accepts
 * provider-specific options via `providerOptions[<provider name>]`.
 */
export type ModelId =
  | 'anthropic/claude-haiku-4.5'
  | 'anthropic/claude-sonnet-4.6'
  | 'anthropic/claude-opus-4.7'
  | 'google/gemini-2.5-pro'
  | 'openai/gpt-5.1-thinking'
  | 'use-mcp'

export type AgentTier = 'free' | 'pro' | 'unlimited'

export interface TierLimits {
  callsPerHour: number
  allowedModels: ReadonlyArray<ModelId>
  maxStepsPerCall: number
}

export const ALL_MODELS: ReadonlyArray<ModelId> = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.7',
  'google/gemini-2.5-pro',
  'openai/gpt-5.1-thinking',
]

export const DEFAULT_MODEL: ModelId = 'anthropic/claude-haiku-4.5'

export const TIER_LIMITS: Record<AgentTier, TierLimits> = {
  free: {
    callsPerHour: 30,
    allowedModels: ['anthropic/claude-haiku-4.5'],
    maxStepsPerCall: 10,
  },
  pro: {
    callsPerHour: 300,
    allowedModels: ALL_MODELS,
    maxStepsPerCall: 20,
  },
  unlimited: {
    callsPerHour: 9999,
    allowedModels: ALL_MODELS,
    maxStepsPerCall: 40,
  },
}

export async function getUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<AgentTier> {
  const { data, error } = await supabase
    .from('user_account_flags')
    .select('idlebrew_pro_subscribed')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.idlebrew_pro_subscribed ? 'pro' : 'free'
}

export async function getIdlebrewProNotifyMe(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_account_flags')
    .select('idlebrew_pro_notify_me')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.idlebrew_pro_notify_me ?? false
}

export interface QuotaCheck {
  ok: boolean
  callsThisHour: number
  callsRemaining: number
  resetAt: Date
  reason?: 'tier_model' | 'rate_limit'
}

/**
 * Sliding-window count of calls in the last hour. Inserts a new row only on
 * success; callers do that themselves AFTER tier validation passes, so a 403
 * doesn't burn quota.
 */
export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  tier: TierLimits
): Promise<QuotaCheck> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('agent_call_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('called_at', oneHourAgo)
  if (error) throw new Error(error.message)

  const used = count ?? 0
  const remaining = Math.max(0, tier.callsPerHour - used)
  return {
    ok: used < tier.callsPerHour,
    callsThisHour: used,
    callsRemaining: remaining,
    resetAt: new Date(Date.now() + 60 * 60 * 1000),
    reason: used >= tier.callsPerHour ? 'rate_limit' : undefined,
  }
}

export async function recordCall(
  supabase: SupabaseClient,
  userId: string,
  model: ModelId
): Promise<void> {
  const { error } = await supabase
    .from('agent_call_log')
    .insert({ user_id: userId, model })
  if (error) {
    // Don't fail the request because quota logging blew up. Just warn.
    console.warn('[agent-quota] recordCall failed:', error.message)
  }
}
