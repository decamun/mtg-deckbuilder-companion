-- Deck likes: one row per user per deck (authenticated users only).

CREATE TABLE public.deck_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_likes_pkey PRIMARY KEY (user_id, deck_id)
);

CREATE INDEX deck_likes_deck_id_idx ON public.deck_likes (deck_id);

ALTER TABLE public.deck_likes ENABLE ROW LEVEL SECURITY;

-- Users can read only their own like rows (for "liked?" and listing liked decks).
CREATE POLICY "Users read own deck likes"
  ON public.deck_likes
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users insert own deck likes for visible decks"
  ON public.deck_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.decks d
      WHERE d.id = deck_id
        AND (d.is_public OR d.user_id = (select auth.uid()))
    )
  );

CREATE POLICY "Users delete own deck likes"
  ON public.deck_likes
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Public like counts without exposing which accounts liked a deck.
CREATE OR REPLACE FUNCTION public.deck_like_count (p_deck_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.deck_likes l
  WHERE l.deck_id = p_deck_id
    AND EXISTS (
      SELECT 1
      FROM public.decks d
      WHERE d.id = p_deck_id
        AND (d.is_public OR d.user_id = (select auth.uid()))
    );
$$;

REVOKE ALL ON FUNCTION public.deck_like_count (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deck_like_count (uuid) TO anon, authenticated;
