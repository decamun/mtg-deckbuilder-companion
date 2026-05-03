export type OAuthProviderId = 'google' | 'discord'

export interface OAuthProviderConfig {
  id: OAuthProviderId
  label: string
}

const OAUTH_PROVIDERS: OAuthProviderConfig[] = [
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
]

const PRODUCTION_SUPABASE_REF = 'ejnnjdvgrwsjfgafxtvk'

function configuredProviderIds(): Set<string> | null {
  const raw = process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS
  if (raw === undefined) return null
  return new Set(
    raw
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function getEnabledOAuthProviders(): OAuthProviderConfig[] {
  const configured = configuredProviderIds()
  if (configured) {
    return OAUTH_PROVIDERS.filter((provider) => configured.has(provider.id))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!supabaseUrl.includes(`${PRODUCTION_SUPABASE_REF}.supabase.co`)) {
    return []
  }

  return OAUTH_PROVIDERS
}

export const enabledOAuthProviders = getEnabledOAuthProviders()

export const hasOAuthProviders = enabledOAuthProviders.length > 0
