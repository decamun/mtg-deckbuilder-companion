import Link from 'next/link'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getClient } from '@/lib/oauth-store'
import { Button } from '@/components/ui/button'
import { approveAuthorization } from './actions'
import { AuthorizeLoginRequired } from './AuthorizeLoginRequired'

export const dynamic = 'force-dynamic'

interface SearchParams {
  client_id?: string
  redirect_uri?: string
  response_type?: string
  code_challenge?: string
  code_challenge_method?: string
  state?: string
  scope?: string
  resource?: string
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-24 w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <Link
        href="/"
        className="mt-4 inline-flex text-sm text-primary hover:underline"
      >
        Back to idlebrew
      </Link>
    </div>
  )
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  // Validate request shape before doing anything else. Errors render in-page;
  // they should never bounce the user back to a redirect_uri we don't trust.
  if (params.response_type !== 'code') {
    return (
      <ErrorPanel
        title="Unsupported response type"
        detail={"Only response_type=code is supported. The MCP client should request the authorization code grant."}
      />
    )
  }
  if (!params.client_id || !params.redirect_uri || !params.code_challenge) {
    return (
      <ErrorPanel
        title="Missing parameters"
        detail="client_id, redirect_uri, and code_challenge are all required."
      />
    )
  }
  if ((params.code_challenge_method ?? 'S256') !== 'S256') {
    return (
      <ErrorPanel
        title="Unsupported PKCE method"
        detail="Only S256 PKCE is supported. The MCP client should send code_challenge_method=S256."
      />
    )
  }

  const client = await getClient(params.client_id)
  if (!client) {
    return (
      <ErrorPanel
        title="Unknown client"
        detail="No client is registered for this client_id. The MCP client must call /oauth/register first."
      />
    )
  }
  if (!client.redirect_uris.includes(params.redirect_uri)) {
    return (
      <ErrorPanel
        title="Invalid redirect_uri"
        detail="The redirect_uri is not one of the URIs this client registered."
      />
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const clientName = client.client_name || 'an external MCP client'

  return (
    <main className="mx-auto mt-12 w-full max-w-md px-4 pb-16">
      <div className="rounded-xl border border-border bg-card/80 p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Authorize MCP access</h1>
        </div>

        {!user ? (
          <AuthorizeLoginRequired clientName={clientName} />
        ) : (
          <form action={approveAuthorization} className="space-y-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">{clientName}</span> wants to connect
              to your idlebrew account.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">It will be able to:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Read all of your decks and decklists</li>
                <li>Add, remove, and edit cards in your decks</li>
                <li>Read and write deck primers</li>
                <li>Search Scryfall on your behalf</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Signed in as{' '}
              <span className="font-medium text-foreground">{user.email}</span>.
              You can revoke this access any time from your profile.
            </p>

            <input type="hidden" name="client_id" value={params.client_id} />
            <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
            <input type="hidden" name="code_challenge" value={params.code_challenge} />
            <input
              type="hidden"
              name="code_challenge_method"
              value={params.code_challenge_method ?? 'S256'}
            />
            {params.state && <input type="hidden" name="state" value={params.state} />}
            {params.scope && <input type="hidden" name="scope" value={params.scope} />}
            {params.resource && <input type="hidden" name="resource" value={params.resource} />}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Link
                href={params.redirect_uri + '?error=access_denied' + (params.state ? `&state=${encodeURIComponent(params.state)}` : '')}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Link>
              <Button type="submit">Authorize</Button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
