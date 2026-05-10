-- P0 social-launch security remediation.
--
-- Agent quota writes now fail closed in the route handler. This migration makes
-- the database side enforce the same invariants for direct Data API access.

ALTER TABLE public.agent_call_log
  DROP CONSTRAINT IF EXISTS agent_call_log_model_check;

ALTER TABLE public.agent_call_log
  ADD CONSTRAINT agent_call_log_model_check
  CHECK (
    model IN (
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-opus-4.7',
      'google/gemini-2.5-pro',
      'openai/gpt-5.1-thinking'
    )
  );

DROP POLICY IF EXISTS "Users read own agent log" ON public.agent_call_log;
CREATE POLICY "Users read own agent log"
  ON public.agent_call_log
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own agent log" ON public.agent_call_log;
CREATE POLICY "Users insert own agent log"
  ON public.agent_call_log
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

ALTER TABLE public.mcp_api_keys
  ADD COLUMN IF NOT EXISTS request_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_coarse_ip_hash text;

DROP POLICY IF EXISTS "Users manage own api keys" ON public.mcp_api_keys;
CREATE POLICY "Users manage own api keys"
  ON public.mcp_api_keys
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS mcp_api_keys_active_user_idx
  ON public.mcp_api_keys (user_id, is_active);

-- Advisor hardening: lock the RPC search path and keep it invoker-scoped so
-- RLS still gates all underlying deck/deck_cards operations.
CREATE OR REPLACE FUNCTION public.revert_deck_to_version(p_deck_id uuid, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
BEGIN
  PERFORM set_config('idlebrew.skip_deck_versions', 'on', true);

  SELECT snapshot INTO snap
    FROM public.deck_versions
   WHERE id = p_version_id AND deck_id = p_deck_id;

  IF snap IS NULL THEN
    RAISE EXCEPTION 'Version not found for deck';
  END IF;

  UPDATE public.decks
     SET name = COALESCE(snap->'deck'->>'name', name),
         description = snap->'deck'->>'description',
         format = snap->'deck'->>'format',
         is_public = COALESCE((snap->'deck'->>'is_public')::boolean, is_public),
         cover_image_scryfall_id = NULLIF(snap->'deck'->>'cover_image_scryfall_id', ''),
         commander_scryfall_ids = COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(snap->'deck'->'commanders')),
           '{}'::text[]
         ),
         primer_markdown = COALESCE(snap->>'primer_markdown', ''),
         updated_at = now()
   WHERE id = p_deck_id;

  DELETE FROM public.deck_cards WHERE deck_id = p_deck_id;

  INSERT INTO public.deck_cards
    (deck_id, scryfall_id, printing_scryfall_id, finish, oracle_id, name, quantity, zone, tags)
  SELECT p_deck_id,
         c->>'scryfall_id',
         NULLIF(c->>'printing_scryfall_id', ''),
         COALESCE(c->>'finish', 'nonfoil'),
         NULLIF(c->>'oracle_id', ''),
         c->>'name',
         COALESCE((c->>'quantity')::int, 1),
         COALESCE(c->>'zone', 'mainboard'),
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(c->'tags')),
           '{}'::text[]
         )
  FROM jsonb_array_elements(snap->'cards') c;
END;
$$;
