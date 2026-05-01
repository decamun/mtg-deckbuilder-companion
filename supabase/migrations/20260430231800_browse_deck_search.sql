-- Browse/search metadata and RPC for public deck discovery.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS budget_usd numeric(10, 2),
  ADD COLUMN IF NOT EXISTS bracket integer,
  ADD COLUMN IF NOT EXISTS deck_search_text text GENERATED ALWAYS AS (
    lower(coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS deck_search_fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

ALTER TABLE public.decks
  DROP CONSTRAINT IF EXISTS decks_budget_usd_nonnegative,
  ADD CONSTRAINT decks_budget_usd_nonnegative
    CHECK (budget_usd IS NULL OR budget_usd >= 0);

ALTER TABLE public.decks
  DROP CONSTRAINT IF EXISTS decks_bracket_range,
  ADD CONSTRAINT decks_bracket_range
    CHECK (bracket IS NULL OR bracket BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS decks_search_fts_idx
  ON public.decks USING gin (deck_search_fts);

CREATE INDEX IF NOT EXISTS decks_search_text_trgm_idx
  ON public.decks USING gin (deck_search_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS decks_browse_filters_idx
  ON public.decks (format, bracket, budget_usd)
  WHERE is_public;

CREATE INDEX IF NOT EXISTS deck_cards_deck_id_name_idx
  ON public.deck_cards (deck_id, name);

CREATE OR REPLACE FUNCTION public.browse_decks(
  p_search text DEFAULT '',
  p_commander text DEFAULT '',
  p_min_budget numeric DEFAULT NULL,
  p_max_budget numeric DEFAULT NULL,
  p_bracket integer DEFAULT NULL,
  p_format text DEFAULT '',
  p_limit integer DEFAULT 24
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  format text,
  cover_image_scryfall_id text,
  commander_scryfall_ids text[],
  commander_names text[],
  budget_usd numeric,
  bracket integer,
  created_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH params AS (
  SELECT
    NULLIF(btrim(coalesce(p_search, '')), '') AS search_term,
    lower(NULLIF(btrim(coalesce(p_search, '')), '')) AS search_term_lower,
    CASE
      WHEN NULLIF(btrim(coalesce(p_search, '')), '') IS NULL THEN NULL::tsquery
      ELSE websearch_to_tsquery('english', btrim(p_search))
    END AS search_query,
    lower(NULLIF(btrim(coalesce(p_commander, '')), '')) AS commander_term,
    NULLIF(btrim(coalesce(p_format, '')), '') AS format_term,
    greatest(1, least(coalesce(p_limit, 24), 60)) AS safe_limit
),
deck_rows AS (
  SELECT
    d.id,
    d.name,
    d.description,
    d.format,
    d.cover_image_scryfall_id,
    COALESCE(d.commander_scryfall_ids, '{}'::text[]) AS commander_scryfall_ids,
    d.budget_usd,
    d.bracket,
    d.created_at,
    d.deck_search_fts,
    d.deck_search_text,
    COALESCE(commanders.names, '{}'::text[]) AS commander_names,
    lower(
      coalesce(d.name, '') || ' ' ||
      coalesce(d.description, '') || ' ' ||
      coalesce(array_to_string(commanders.names, ' '), '')
    ) AS combined_search_text
  FROM public.decks d
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT c.name ORDER BY c.name) AS names
    FROM public.deck_cards c
    WHERE c.deck_id = d.id
      AND c.scryfall_id = ANY(COALESCE(d.commander_scryfall_ids, '{}'::text[]))
  ) commanders ON true
  WHERE d.is_public
)
SELECT
  dr.id,
  dr.name,
  dr.description,
  dr.format,
  dr.cover_image_scryfall_id,
  dr.commander_scryfall_ids,
  dr.commander_names,
  dr.budget_usd,
  dr.bracket,
  dr.created_at,
  CASE
    WHEN params.search_term IS NULL THEN 0
    ELSE (
      ts_rank_cd(dr.deck_search_fts, params.search_query) * 4
      + extensions.word_similarity(params.search_term_lower, dr.combined_search_text)
      + CASE WHEN dr.combined_search_text LIKE '%' || params.search_term_lower || '%' THEN 0.5 ELSE 0 END
    )::real
  END AS rank
FROM deck_rows dr
CROSS JOIN params
WHERE
  (params.search_term IS NULL
    OR dr.deck_search_fts @@ params.search_query
    OR extensions.word_similarity(params.search_term_lower, dr.combined_search_text) >= 0.18
    OR dr.combined_search_text LIKE '%' || params.search_term_lower || '%')
  AND (params.commander_term IS NULL
    OR lower(array_to_string(dr.commander_names, ' ')) LIKE '%' || params.commander_term || '%'
    OR extensions.word_similarity(params.commander_term, lower(array_to_string(dr.commander_names, ' '))) >= 0.18)
  AND (p_min_budget IS NULL OR dr.budget_usd >= p_min_budget)
  AND (p_max_budget IS NULL OR dr.budget_usd <= p_max_budget)
  AND (p_bracket IS NULL OR dr.bracket = p_bracket)
  AND (params.format_term IS NULL OR dr.format = params.format_term)
ORDER BY
  rank DESC,
  dr.created_at DESC
LIMIT (SELECT safe_limit FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.browse_decks(text, text, numeric, numeric, integer, text, integer)
  TO anon, authenticated;

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
      'is_public', COALESCE(deck_row.is_public, false),
      'budget_usd', deck_row.budget_usd,
      'bracket', deck_row.bracket
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
  ELSIF p_old.budget_usd IS DISTINCT FROM p_new.budget_usd THEN
    RETURN 'Updated budget';
  ELSIF p_old.bracket IS DISTINCT FROM p_new.bracket THEN
    RETURN 'Changed bracket to ' || COALESCE(p_new.bracket::text, 'none');
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
    AND OLD.budget_usd IS NOT DISTINCT FROM NEW.budget_usd
    AND OLD.bracket IS NOT DISTINCT FROM NEW.bracket
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

DROP TRIGGER IF EXISTS decks_record_metadata_version ON public.decks;
CREATE TRIGGER decks_record_metadata_version
AFTER UPDATE OF name, description, format, budget_usd, bracket, is_public, commander_scryfall_ids, cover_image_scryfall_id, primer_markdown ON public.decks
FOR EACH ROW EXECUTE FUNCTION public.record_deck_metadata_version();

CREATE OR REPLACE FUNCTION public.revert_deck_to_version(p_deck_id uuid, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
         budget_usd = NULLIF(snap->'deck'->>'budget_usd', '')::numeric,
         bracket = NULLIF(snap->'deck'->>'bracket', '')::integer,
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
