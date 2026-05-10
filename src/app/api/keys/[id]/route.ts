import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRequestId } from '@/lib/request-id'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request)
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized', requestId },
      { status: 401, headers: { 'x-request-id': requestId } }
    )
  }

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error('[api-keys] delete failed', {
      userId: user.id,
      keyId: id,
      requestId,
      error: error.message,
    })
    return NextResponse.json(
      { message: 'Unable to delete API key', requestId },
      { status: 500, headers: { 'x-request-id': requestId } }
    )
  }
  if (!data || data.length === 0) {
    // Deliberately ambiguous: 404 either way to prevent enumeration.
    return NextResponse.json(
      { message: 'Not found', requestId },
      { status: 404, headers: { 'x-request-id': requestId } }
    )
  }
  return new NextResponse(null, {
    status: 204,
    headers: { 'x-request-id': requestId },
  })
}
