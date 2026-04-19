-- Add array column to support up to 2 commanders
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS commander_scryfall_ids text[] DEFAULT '{}'::text[];

-- Migrate existing data from the single-commander column
UPDATE public.decks
  SET commander_scryfall_ids = ARRAY[commander_scryfall_id]
  WHERE commander_scryfall_id IS NOT NULL AND commander_scryfall_ids = '{}';
