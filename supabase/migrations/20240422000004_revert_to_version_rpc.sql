-- Atomically restores deck state from a version snapshot.
-- SECURITY INVOKER: RLS enforces that only the deck owner can succeed.

CREATE OR REPLACE FUNCTION public.revert_deck_to_version(p_deck_id uuid, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  snap jsonb;
BEGIN
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
