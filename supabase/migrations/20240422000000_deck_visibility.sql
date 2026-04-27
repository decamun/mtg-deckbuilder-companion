-- Adds visibility, primer markdown source, and an updated_at column.
-- Existing decks become publicly visible by default (per product decision).

ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS primer_markdown text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS decks_is_public_idx ON public.decks (is_public) WHERE is_public;
