import { createClient } from '@/lib/supabase/server'
import { getTrustedRedirectOrigin } from '@/lib/trusted-site-url'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const base = getTrustedRedirectOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL('/brew', base))
    }
  }

  return NextResponse.redirect(new URL('/?error=auth_callback_error', base))
}
