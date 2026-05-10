-- OAuth 2.1 + Dynamic Client Registration support for the MCP server.
--
-- Lets MCP clients (Claude Desktop, Cursor, etc.) authenticate the user via the
-- standard MCP Authorization flow without a local stdio bridge:
--   1. Client calls POST /oauth/register to get a client_id (DCR).
--   2. User is redirected to /oauth/authorize, signs in, approves.
--   3. Client exchanges the auth code at POST /oauth/token for an access_token.
--   4. Client uses Bearer <access_token> against /api/mcp.
--
-- Auth codes and tokens are stored hashed (SHA-256), never in plaintext, mirroring
-- the existing mcp_api_keys design. RLS lets a user revoke their own connections.

-- Public, dynamically-registered clients. No client_secret: PKCE handles the
-- confidentiality of the auth-code-to-token exchange.
CREATE TABLE public.oauth_clients (
  client_id      text         NOT NULL PRIMARY KEY,
  client_name    text,
  redirect_uris  text[]       NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

-- Short-lived single-use authorization codes (10 minute TTL enforced at issue).
CREATE TABLE public.oauth_authorization_codes (
  code_hash              text         NOT NULL PRIMARY KEY,
  client_id              text         NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id                uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri           text         NOT NULL,
  code_challenge         text         NOT NULL,
  code_challenge_method  text         NOT NULL,
  scope                  text,
  resource               text,
  expires_at             timestamptz  NOT NULL,
  used_at                timestamptz
);

CREATE INDEX oauth_authorization_codes_user_id_idx
  ON public.oauth_authorization_codes (user_id);

-- Long-lived (90 day default) access tokens. Hash is the primary key.
CREATE TABLE public.oauth_access_tokens (
  token_hash    text         NOT NULL PRIMARY KEY,
  client_id     text         NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope         text,
  resource      text,
  expires_at    timestamptz  NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

CREATE INDEX oauth_access_tokens_user_id_idx ON public.oauth_access_tokens (user_id);

ALTER TABLE public.oauth_clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorization_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_access_tokens        ENABLE ROW LEVEL SECURITY;

-- All API operations on these tables run through the service-role client in the
-- /oauth/* route handlers. The only RLS-mediated access is the profile page
-- listing the user's own connected apps and revoking them.

CREATE POLICY "Users read own oauth tokens" ON public.oauth_access_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users revoke own oauth tokens" ON public.oauth_access_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Clients are looked up by client_id during the authorize page render, which
-- runs as the signed-in user. Allow authenticated reads only.
CREATE POLICY "Authenticated read clients" ON public.oauth_clients
  FOR SELECT USING (auth.role() = 'authenticated');
