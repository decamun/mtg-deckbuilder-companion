import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdlebrewProNotifyMe, getUserTier, TIER_LIMITS, checkQuota } from '@/lib/agent-quota'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const [tierName, idlebrewProNotifyMe] = await Promise.all([
    getUserTier(supabase, user.id),
    getIdlebrewProNotifyMe(supabase, user.id),
  ])
  const tier = TIER_LIMITS[tierName]
  const quota = await checkQuota(supabase, user.id, tier)

  return NextResponse.json({
    tier: tierName,
    idlebrewProSubscribed: tierName === 'pro' || tierName === 'unlimited',
    idlebrewProNotifyMe,
    callsPerHour: tier.callsPerHour,
    callsThisHour: quota.callsThisHour,
    callsRemaining: quota.callsRemaining,
    allowedModels: tier.allowedModels,
    resetAt: quota.resetAt.toISOString(),
  })
}
