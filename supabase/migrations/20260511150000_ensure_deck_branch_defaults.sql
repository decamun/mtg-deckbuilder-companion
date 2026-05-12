-- Repair decks missing `current_branch_id` / `main` (partial deploys, trigger races,
-- or legacy rows). Exposed to deck owners via RPC; one-time DO block fixes fleet.

CREATE OR REPLACE FUNCTION public.ensure_deck_branch_defaults(p_deck_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_main uuid;
  v_head uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.decks d
     WHERE d.id = p_deck_id
       AND d.user_id = (select auth.uid())
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_main
    FROM public.deck_branches
   WHERE deck_id = p_deck_id AND name = 'main'
   LIMIT 1;

  IF v_main IS NULL THEN
    INSERT INTO public.deck_branches (deck_id, name)
    VALUES (p_deck_id, 'main')
    RETURNING id INTO v_main;
  END IF;

  UPDATE public.deck_versions
     SET branch_id = v_main
   WHERE deck_id = p_deck_id
     AND branch_id IS NULL;

  SELECT id INTO v_head
    FROM public.deck_versions
   WHERE deck_id = p_deck_id
   ORDER BY created_at DESC
   LIMIT 1;

  UPDATE public.deck_branches
     SET head_version_id = v_head,
         updated_at = now()
   WHERE id = v_main;

  UPDATE public.decks
     SET current_branch_id = v_main,
         updated_at = now()
   WHERE id = p_deck_id
     AND current_branch_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_deck_branch_defaults(uuid) TO authenticated;

-- One-time repair as migration role (bypasses RLS; no auth.uid()).
DO $$
DECLARE
  r RECORD;
  v_main uuid;
  v_head uuid;
BEGIN
  FOR r IN SELECT id AS deck_id FROM public.decks WHERE current_branch_id IS NULL LOOP
    SELECT id INTO v_main FROM public.deck_branches WHERE deck_id = r.deck_id AND name = 'main' LIMIT 1;
    IF v_main IS NULL THEN
      INSERT INTO public.deck_branches (deck_id, name)
      VALUES (r.deck_id, 'main')
      RETURNING id INTO v_main;
    END IF;

    UPDATE public.deck_versions
       SET branch_id = v_main
     WHERE deck_id = r.deck_id AND branch_id IS NULL;

    SELECT id INTO v_head
      FROM public.deck_versions
     WHERE deck_id = r.deck_id
     ORDER BY created_at DESC
     LIMIT 1;

    UPDATE public.deck_branches
       SET head_version_id = v_head,
           updated_at = now()
     WHERE id = v_main;

    UPDATE public.decks
       SET current_branch_id = v_main,
           updated_at = now()
     WHERE id = r.deck_id AND current_branch_id IS NULL;
  END LOOP;
END $$;
