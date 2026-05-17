import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTier } from '@/lib/agent-quota'
import { getRequestId } from '@/lib/request-id'
import { shouldServeAdSense } from '@/lib/ads-env'

export const dynamic = 'force-dynamic'

/**
 * Whether the current viewer may see display ads. Mirrors agent tier Pro
 * detection in `/api/agent/limits` (idlebrew Pro is ad-free).
 */
export async function GET(request: Request) {
  const requestId = getRequestId(request)

  if (!shouldServeAdSense()) {
    return NextResponse.json(
      { showAds: false, requestId },
      { headers: { 'x-request-id': requestId } }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { showAds: true, requestId },
      { headers: { 'x-request-id': requestId } }
    )
  }

  const tierName = await getUserTier(supabase, user.id)
  const subscribed = tierName === 'pro' || tierName === 'unlimited'

  return NextResponse.json(
    { showAds: !subscribed, requestId },
    { headers: { 'x-request-id': requestId } }
  )
}
