import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/mcp-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, is_active')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[api-keys] list failed', { userId: user.id, error: error.message })
    return NextResponse.json({ message: 'Unable to list API keys.' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 })
  }
  const name = (body as { name?: unknown })?.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ message: 'name is required' }, { status: 400 })
  }
  if (name.length > 100) {
    return NextResponse.json({ message: 'name too long' }, { status: 400 })
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
    console.error('[api-keys] create failed', { userId: user.id, error: error.message })
    return NextResponse.json({ message: 'Unable to create API key.' }, { status: 500 })
  }

  return NextResponse.json({ ...data, key: raw }, { status: 201 })
}
