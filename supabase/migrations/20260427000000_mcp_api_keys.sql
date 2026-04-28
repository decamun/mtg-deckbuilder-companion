-- MCP API keys for programmatic access by external agents (Claude Desktop, etc).
--
-- Keys are surfaced once at creation; only their SHA-256 hash is persisted.
-- Format: "idlb_" + 32 hex chars.

CREATE TABLE public.mcp_api_keys (
  id            uuid         NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text         NOT NULL,
  key_hash      text         NOT NULL UNIQUE,
  key_prefix    text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  is_active     boolean      NOT NULL DEFAULT true,
  CONSTRAINT mcp_api_keys_pkey PRIMARY KEY (id)
);

CREATE INDEX mcp_api_keys_key_hash_idx ON public.mcp_api_keys (key_hash);
CREATE INDEX mcp_api_keys_user_id_idx  ON public.mcp_api_keys (user_id);

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own api keys" ON public.mcp_api_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
