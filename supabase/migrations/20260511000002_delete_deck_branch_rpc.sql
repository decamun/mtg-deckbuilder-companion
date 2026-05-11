-- Remove a non-main branch and all version rows recorded on that branch.
-- Callers must switch away first if this was the active branch (enforced below).

CREATE OR REPLACE FUNCTION public.delete_deck_branch(p_deck_id uuid, p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  br public.deck_branches%ROWTYPE;
BEGIN
  SELECT * INTO br
    FROM public.deck_branches
   WHERE id = p_branch_id AND deck_id = p_deck_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found for deck';
  END IF;

  IF br.name = 'main' THEN
    RAISE EXCEPTION 'Cannot delete the main branch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.decks WHERE id = p_deck_id AND current_branch_id = p_branch_id) THEN
    RAISE EXCEPTION 'Switch to another branch before deleting this one';
  END IF;

  DELETE FROM public.deck_versions WHERE branch_id = p_branch_id;

  DELETE FROM public.deck_branches WHERE id = p_branch_id AND deck_id = p_deck_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_deck_branch(uuid, uuid) TO authenticated;
