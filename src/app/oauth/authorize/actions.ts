'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { issueAuthorizationCode, getClient } from '@/lib/oauth-store'

interface ApproveInput {
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scope: string | null
  resource: string | null
  state: string | null
}

/**
 * Approve an authorization request. Issues an auth code and 302s the user
 * back to the client's redirect_uri with `code` and (if supplied) `state`.
 *
 * The redirect_uri is re-validated against the registered client to defend
 * against tampering between the initial /oauth/authorize render and the
 * approve action. We trust the session for user_id; everything else comes
 * from the form fields and is validated again here.
 */
export async function approveAuthorization(formData: FormData): Promise<void> {
  const input: ApproveInput = {
    client_id: String(formData.get('client_id') ?? ''),
    redirect_uri: String(formData.get('redirect_uri') ?? ''),
    code_challenge: String(formData.get('code_challenge') ?? ''),
    code_challenge_method: String(formData.get('code_challenge_method') ?? ''),
    scope: (formData.get('scope') as string | null) || null,
    resource: (formData.get('resource') as string | null) || null,
    state: (formData.get('state') as string | null) || null,
  }

  if (!input.client_id || !input.redirect_uri || !input.code_challenge) {
    throw new Error('Missing required authorization parameters')
  }
  if (input.code_challenge_method !== 'S256') {
    throw new Error('Only S256 PKCE is supported')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const client = await getClient(input.client_id)
  if (!client) throw new Error('Unknown client_id')
  if (!client.redirect_uris.includes(input.redirect_uri)) {
    throw new Error('redirect_uri is not registered for this client')
  }

  const code = await issueAuthorizationCode({
    client_id: input.client_id,
    user_id: user.id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    scope: input.scope,
    resource: input.resource,
  })

  const url = new URL(input.redirect_uri)
  url.searchParams.set('code', code)
  if (input.state) url.searchParams.set('state', input.state)
  redirect(url.toString())
}
