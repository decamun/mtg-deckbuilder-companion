import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error('[api-keys] delete failed', { userId: user.id, keyId: id, error: error.message })
    return NextResponse.json({ message: 'Unable to delete API key' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    // Deliberately ambiguous: 404 either way to prevent enumeration.
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }
  return new NextResponse(null, { status: 204 })
}
