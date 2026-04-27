-- Adds per-card printing, foiling, and a stable oracle_id reference.
-- oracle_id is nullable until a backfill script populates it from Scryfall.

ALTER TABLE public.deck_cards
  ADD COLUMN IF NOT EXISTS printing_scryfall_id text,
  ADD COLUMN IF NOT EXISTS finish text NOT NULL DEFAULT 'nonfoil',
  ADD COLUMN IF NOT EXISTS oracle_id text;

ALTER TABLE public.deck_cards
  DROP CONSTRAINT IF EXISTS deck_cards_finish_check;

ALTER TABLE public.deck_cards
  ADD CONSTRAINT deck_cards_finish_check
  CHECK (finish IN ('nonfoil', 'foil', 'etched'));

CREATE INDEX IF NOT EXISTS deck_cards_oracle_id_idx ON public.deck_cards (oracle_id);
