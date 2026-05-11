-- Branch switch regression: switch_deck_branch set current_branch_id, then
-- revert_deck_to_version overwrote it with deck_versions.branch_id. When a
-- branch head still points at a shared commit whose branch_id is `main`,
-- every switch to that branch snapped current_branch_id back to main — rapid
-- toggles caused wrong branch attribution and "synced" timelines.
--
-- revert_deck_to_version now accepts an optional branch override (used by
-- switch_deck_branch). Timeline reverts omit it and keep following the
-- snapshot row's branch_id.

DROP FUNCTION IF EXISTS public.switch_deck_branch(uuid, uuid);

DROP FUNCTION IF EXISTS public.revert_deck_to_version(uuid, uuid);

CREATE OR REPLACE FUNCTION public.revert_deck_to_version(
  p_deck_id uuid,
  p_version_id uuid,
  p_branch_override uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  v_branch uuid;
BEGIN
  PERFORM set_config('idlebrew.skip_deck_versions', 'on', true);

  SELECT snapshot, branch_id INTO snap, v_branch
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
         current_branch_id = COALESCE(p_branch_override, v_branch, current_branch_id),
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

CREATE OR REPLACE FUNCTION public.switch_deck_branch(p_deck_id uuid, p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_head uuid;
BEGIN
  SELECT head_version_id INTO v_head
    FROM public.deck_branches
   WHERE id = p_branch_id AND deck_id = p_deck_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found for deck';
  END IF;

  UPDATE public.decks
     SET current_branch_id = p_branch_id,
         updated_at = now()
   WHERE id = p_deck_id;

  IF v_head IS NOT NULL THEN
    PERFORM public.revert_deck_to_version(p_deck_id, v_head, p_branch_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_deck_to_version(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_deck_branch(uuid, uuid) TO authenticated;
