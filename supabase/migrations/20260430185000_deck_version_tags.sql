-- User-defined tags for deck version milestones. The first built-in tag is
-- `paper-build`, but the column intentionally supports arbitrary labels.

ALTER TABLE public.deck_versions
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS deck_versions_tags_idx
  ON public.deck_versions USING gin (tags);

CREATE OR REPLACE FUNCTION public.create_deck_version_snapshot(
  p_deck_id uuid,
  p_parent_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_is_bookmarked boolean DEFAULT false,
  p_change_summary text DEFAULT 'Updated deck',
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS public.deck_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deck_row public.decks%ROWTYPE;
  new_version public.deck_versions%ROWTYPE;
  snap jsonb;
BEGIN
  SELECT * INTO deck_row
    FROM public.decks
   WHERE id = p_deck_id;

  IF deck_row IS NULL THEN
    RAISE EXCEPTION 'Deck not found';
  END IF;

  snap := jsonb_build_object(
    'version', 1,
    'deck', jsonb_build_object(
      'name', deck_row.name,
      'description', deck_row.description,
      'format', deck_row.format,
      'commanders', COALESCE(deck_row.commander_scryfall_ids, '{}'::text[]),
      'cover_image_scryfall_id', deck_row.cover_image_scryfall_id,
      'is_public', COALESCE(deck_row.is_public, false)
    ),
    'cards', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'scryfall_id', c.scryfall_id,
          'printing_scryfall_id', c.printing_scryfall_id,
          'finish', COALESCE(c.finish, 'nonfoil'),
          'oracle_id', c.oracle_id,
          'name', c.name,
          'quantity', c.quantity,
          'zone', COALESCE(c.zone, 'mainboard'),
          'tags', COALESCE(c.tags, '{}'::text[])
        )
        ORDER BY c.name, c.id
      )
      FROM public.deck_cards c
      WHERE c.deck_id = p_deck_id
    ), '[]'::jsonb),
    'primer_markdown', COALESCE(deck_row.primer_markdown, '')
  );

  INSERT INTO public.deck_versions
    (deck_id, parent_id, name, is_bookmarked, tags, change_summary, snapshot, created_by)
  VALUES
    (
      p_deck_id,
      COALESCE(
        p_parent_id,
        (
          SELECT id
            FROM public.deck_versions
           WHERE deck_id = p_deck_id
           ORDER BY created_at DESC
           LIMIT 1
        )
      ),
      p_name,
      COALESCE(p_is_bookmarked, false),
      '{}'::text[],
      COALESCE(NULLIF(p_change_summary, ''), 'Updated deck'),
      snap,
      p_created_by
    )
  RETURNING * INTO new_version;

  RETURN new_version;
END;
$$;
