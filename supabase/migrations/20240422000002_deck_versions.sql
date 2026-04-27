-- Append-only version history. Each row is a full JSONB snapshot of the deck
-- (cards + primer + metadata). Live editor reads stay normalized in deck_cards.

CREATE TABLE IF NOT EXISTS public.deck_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         uuid        NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  parent_id       uuid        REFERENCES public.deck_versions(id) ON DELETE SET NULL,
  name            text,
  is_bookmarked   boolean     NOT NULL DEFAULT false,
  change_summary  text        NOT NULL DEFAULT '',
  snapshot        jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS deck_versions_timeline_idx
  ON public.deck_versions (deck_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deck_versions_named_idx
  ON public.deck_versions (deck_id, created_at DESC) WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS deck_versions_bookmarked_idx
  ON public.deck_versions (deck_id, created_at DESC) WHERE is_bookmarked;

ALTER PUBLICATION supabase_realtime ADD TABLE public.deck_versions;
