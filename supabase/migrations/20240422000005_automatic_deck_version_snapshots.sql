-- Keep version history close to the source of truth. Any deck/card mutation
-- now records a full snapshot, regardless of whether the change comes from the
-- editor, the agent tools, MCP tools, or a future API route.

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
    (deck_id, parent_id, name, is_bookmarked, change_summary, snapshot, created_by)
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
      COALESCE(NULLIF(p_change_summary, ''), 'Updated deck'),
      snap,
      p_created_by
    )
  RETURNING * INTO new_version;

  RETURN new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.deck_card_version_summary(
  p_op text,
  p_old public.deck_cards DEFAULT NULL,
  p_new public.deck_cards DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_op = 'INSERT' THEN
    RETURN 'Added ' || COALESCE(p_new.name, 'card');
  ELSIF p_op = 'DELETE' THEN
    RETURN 'Removed ' || COALESCE(p_old.name, 'card');
  ELSIF p_old.quantity IS DISTINCT FROM p_new.quantity THEN
    RETURN 'Changed ' || COALESCE(p_new.name, p_old.name, 'card') || ' quantity to ' || p_new.quantity;
  ELSIF p_old.tags IS DISTINCT FROM p_new.tags THEN
    RETURN 'Updated tags for ' || COALESCE(p_new.name, p_old.name, 'card');
  ELSIF p_old.printing_scryfall_id IS DISTINCT FROM p_new.printing_scryfall_id THEN
    RETURN 'Changed ' || COALESCE(p_new.name, p_old.name, 'card') || ' printing';
  ELSIF p_old.finish IS DISTINCT FROM p_new.finish THEN
    RETURN 'Changed ' || COALESCE(p_new.name, p_old.name, 'card') || ' finish to ' || p_new.finish;
  ELSE
    RETURN 'Updated ' || COALESCE(p_new.name, p_old.name, 'card');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deck_metadata_version_summary(
  p_old public.decks,
  p_new public.decks
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_old.name IS DISTINCT FROM p_new.name THEN
    RETURN 'Renamed deck to "' || p_new.name || '"';
  ELSIF p_old.description IS DISTINCT FROM p_new.description THEN
    RETURN 'Updated description';
  ELSIF p_old.format IS DISTINCT FROM p_new.format THEN
    RETURN 'Changed format to ' || COALESCE(p_new.format, 'none');
  ELSIF p_old.is_public IS DISTINCT FROM p_new.is_public THEN
    RETURN CASE WHEN p_new.is_public THEN 'Made deck public' ELSE 'Made deck private' END;
  ELSIF p_old.commander_scryfall_ids IS DISTINCT FROM p_new.commander_scryfall_ids THEN
    RETURN 'Updated commanders';
  ELSIF p_old.cover_image_scryfall_id IS DISTINCT FROM p_new.cover_image_scryfall_id THEN
    RETURN CASE WHEN p_new.cover_image_scryfall_id IS NULL THEN 'Removed cover image' ELSE 'Updated cover image' END;
  ELSIF p_old.primer_markdown IS DISTINCT FROM p_new.primer_markdown THEN
    RETURN 'Updated primer';
  ELSE
    RETURN 'Updated deck metadata';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_deck_card_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_deck_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('idlebrew.skip_deck_versions', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  target_deck_id := COALESCE(NEW.deck_id, OLD.deck_id);

  PERFORM public.create_deck_version_snapshot(
    target_deck_id,
    NULL,
    NULL,
    false,
    public.deck_card_version_summary(TG_OP, OLD, NEW),
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_deck_metadata_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('idlebrew.skip_deck_versions', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.name IS NOT DISTINCT FROM NEW.name
    AND OLD.description IS NOT DISTINCT FROM NEW.description
    AND OLD.format IS NOT DISTINCT FROM NEW.format
    AND OLD.is_public IS NOT DISTINCT FROM NEW.is_public
    AND OLD.commander_scryfall_ids IS NOT DISTINCT FROM NEW.commander_scryfall_ids
    AND OLD.cover_image_scryfall_id IS NOT DISTINCT FROM NEW.cover_image_scryfall_id
    AND OLD.primer_markdown IS NOT DISTINCT FROM NEW.primer_markdown
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_deck_version_snapshot(
    NEW.id,
    NULL,
    NULL,
    false,
    public.deck_metadata_version_summary(OLD, NEW),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deck_cards_record_version ON public.deck_cards;
CREATE TRIGGER deck_cards_record_version
AFTER INSERT OR UPDATE OR DELETE ON public.deck_cards
FOR EACH ROW EXECUTE FUNCTION public.record_deck_card_version();

DROP TRIGGER IF EXISTS decks_record_metadata_version ON public.decks;
CREATE TRIGGER decks_record_metadata_version
AFTER UPDATE OF name, description, format, is_public, commander_scryfall_ids, cover_image_scryfall_id, primer_markdown ON public.decks
FOR EACH ROW EXECUTE FUNCTION public.record_deck_metadata_version();

-- Re-define revert so already-migrated databases suppress the row-level
-- version triggers while replacing deck_cards, then the client records one
-- explicit "Reverted" snapshot after the RPC succeeds.
CREATE OR REPLACE FUNCTION public.revert_deck_to_version(p_deck_id uuid, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  snap jsonb;
BEGIN
  PERFORM set_config('idlebrew.skip_deck_versions', 'on', true);

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
