-- Replace the four owner-only SELECT policies with public-or-owner policies.
-- INSERT/UPDATE/DELETE remain owner-only.

DROP POLICY IF EXISTS "Users can view own decks" ON public.decks;

CREATE POLICY "Decks visible to everyone if public, else owner only"
  ON public.decks FOR SELECT
  USING (is_public OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view cards in own decks" ON public.deck_cards;

CREATE POLICY "Deck cards visible if parent deck is visible"
  ON public.deck_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_cards.deck_id
        AND (d.is_public OR d.user_id = auth.uid())
    )
  );

ALTER TABLE public.deck_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Versions visible if parent deck is visible"
  ON public.deck_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND (d.is_public OR d.user_id = auth.uid())
    )
  );

CREATE POLICY "Owner can insert versions"
  ON public.deck_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update versions"
  ON public.deck_versions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete versions"
  ON public.deck_versions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_versions.deck_id
        AND d.user_id = auth.uid()
    )
  );
