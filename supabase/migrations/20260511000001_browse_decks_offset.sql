-- Add optional offset to browse_decks for paginated / infinite-scroll loading.

DROP FUNCTION IF EXISTS public.browse_decks(text, text, numeric, numeric, integer, text, integer);

CREATE OR REPLACE FUNCTION public.browse_decks(
  p_search text DEFAULT '',
  p_commander text DEFAULT '',
  p_min_budget numeric DEFAULT NULL,
  p_max_budget numeric DEFAULT NULL,
  p_bracket integer DEFAULT NULL,
  p_format text DEFAULT '',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
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
    greatest(1, least(coalesce(p_limit, 24), 60)) AS safe_limit,
    greatest(0, coalesce(p_offset, 0)) AS safe_offset
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
LIMIT (SELECT safe_limit FROM params)
OFFSET (SELECT safe_offset FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.browse_decks(text, text, numeric, numeric, integer, text, integer, integer)
  TO anon, authenticated;
