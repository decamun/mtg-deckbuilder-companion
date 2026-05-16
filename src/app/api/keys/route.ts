import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/mcp-auth'
import { getRequestId } from '@/lib/request-id'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestId = getRequestId(request)
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
    .select('id, name, key_prefix, created_at, last_used_at, is_active')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    logger.error('[api-keys] list failed', { userId: user.id, requestId, error: error.message })
    return NextResponse.json(
      { message: 'Unable to list API keys.', requestId },
      { status: 500, headers: { 'x-request-id': requestId } }
    )
  }

  return NextResponse.json(data, { headers: { 'x-request-id': requestId } })
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON', requestId },
      { status: 400, headers: { 'x-request-id': requestId } }
    )
  }
  const name = (body as { name?: unknown })?.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { message: 'name is required', requestId },
      { status: 400, headers: { 'x-request-id': requestId } }
    )
  }
  if (name.length > 100) {
    return NextResponse.json(
      { message: 'name too long', requestId },
      { status: 400, headers: { 'x-request-id': requestId } }
    )
  }

  const { raw, hash, prefix } = await generateApiKey()
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .insert({
      user_id: user.id,
      name: name.trim(),
      key_hash: hash,
      key_prefix: prefix,
      is_active: true,
    })
    .select('id, name, key_prefix, created_at')
    .single()
  if (error) {
    logger.error('[api-keys] create failed', { userId: user.id, requestId, error: error.message })
    return NextResponse.json(
      { message: 'Unable to create API key.', requestId },
      { status: 500, headers: { 'x-request-id': requestId } }
    )
  }

  return NextResponse.json(
    { ...data, key: raw, requestId },
    { status: 201, headers: { 'x-request-id': requestId } }
  )
}
