-- Enable Row Level Security so users can only access their own data

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- Decks: each user owns their own rows
CREATE POLICY "Users can view own decks"
  ON public.decks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own decks"
  ON public.decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decks"
  ON public.decks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own decks"
  ON public.decks FOR DELETE
  USING (auth.uid() = user_id);

-- Deck cards: access is gated through the parent deck's user_id
CREATE POLICY "Users can view cards in own decks"
  ON public.deck_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cards into own decks"
  ON public.deck_cards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update cards in own decks"
  ON public.deck_cards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cards from own decks"
  ON public.deck_cards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
        AND decks.user_id = auth.uid()
    )
  );
