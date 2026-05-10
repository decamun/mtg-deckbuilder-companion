-- Performance: indexes on FK columns flagged by Supabase Performance Advisor.
CREATE INDEX IF NOT EXISTS decks_user_id_idx ON public.decks (user_id);

CREATE INDEX IF NOT EXISTS deck_versions_parent_id_idx
  ON public.deck_versions (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deck_versions_created_by_idx
  ON public.deck_versions (created_by)
  WHERE created_by IS NOT NULL;

-- Security Advisor: Supabase may expose rls_auto_enable() to anon/authenticated.
-- Revoke all variants if present (definition may come from platform/templates).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

-- RLS init-plan hardening: evaluate auth.uid() once per statement (Postgres 15+
-- advisor recommendation for policies referencing auth.uid()).

DROP POLICY IF EXISTS "Decks visible to everyone if public, else owner only" ON public.decks;
CREATE POLICY "Decks visible to everyone if public, else owner only"
  ON public.decks FOR SELECT
  USING (is_public OR (select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own decks" ON public.decks;
CREATE POLICY "Users can create own decks"
  ON public.decks FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own decks" ON public.decks;
CREATE POLICY "Users can update own decks"
  ON public.decks FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own decks" ON public.decks;
CREATE POLICY "Users can delete own decks"
  ON public.decks FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Deck cards visible if parent deck is visible" ON public.deck_cards;
CREATE POLICY "Deck cards visible if parent deck is visible"
  ON public.deck_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_cards.deck_id
        AND (d.is_public OR d.user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can insert cards into own decks" ON public.deck_cards;
CREATE POLICY "Users can insert cards into own decks"
  ON public.deck_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update cards in own decks" ON public.deck_cards;
CREATE POLICY "Users can update cards in own decks"
  ON public.deck_cards FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete cards from own decks" ON public.deck_cards;
CREATE POLICY "Users can delete cards from own decks"
  ON public.deck_cards FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Versions visible if parent deck is visible" ON public.deck_versions;
CREATE POLICY "Versions visible if parent deck is visible"
  ON public.deck_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND (d.is_public OR d.user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Owner can insert versions" ON public.deck_versions;
CREATE POLICY "Owner can insert versions"
  ON public.deck_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner can update versions" ON public.deck_versions;
CREATE POLICY "Owner can update versions"
  ON public.deck_versions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner can delete versions" ON public.deck_versions;
CREATE POLICY "Owner can delete versions"
  ON public.deck_versions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users read own oauth tokens" ON public.oauth_access_tokens;
CREATE POLICY "Users read own oauth tokens"
  ON public.oauth_access_tokens
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users revoke own oauth tokens" ON public.oauth_access_tokens;
CREATE POLICY "Users revoke own oauth tokens"
  ON public.oauth_access_tokens
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
