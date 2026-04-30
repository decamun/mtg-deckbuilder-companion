import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_account_flags')
    .upsert(
      {
        user_id: user.id,
        idlebrew_pro_notify_me: true,
      },
      { onConflict: 'user_id' }
    )
    .select('idlebrew_pro_subscribed, idlebrew_pro_notify_me')
    .single()

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({
    idlebrewProSubscribed: data.idlebrew_pro_subscribed,
    idlebrewProNotifyMe: data.idlebrew_pro_notify_me,
  })
}
