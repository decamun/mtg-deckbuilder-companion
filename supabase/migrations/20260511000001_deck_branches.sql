-- Git-style branches for deck version history. Each deck has a `main` branch by
-- default; `deck_branches.head_version_id` tracks the tip. New snapshots attach to
-- `decks.current_branch_id` and extend that branch's chain via `parent_id`.
--
-- Storage note: each `deck_versions.snapshot` remains a full JSONB deck state.
-- Future efficiency options (not implemented here): append-only row-level deltas,
-- content-addressed blob refs for snapshots, or periodic compaction — see
-- `src/lib/versions.ts` discussion in the app.

-- ─── Schema ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deck_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  name text NOT NULL,
  head_version_id uuid REFERENCES public.deck_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_branches_deck_name_unique UNIQUE (deck_id, name)
);

CREATE INDEX IF NOT EXISTS deck_branches_deck_id_idx
  ON public.deck_branches (deck_id);

ALTER TABLE public.deck_versions
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.deck_branches(id) ON DELETE SET NULL;

ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS current_branch_id uuid REFERENCES public.deck_branches(id) ON DELETE SET NULL;

-- ─── Backfill existing decks ────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  v_main uuid;
  v_head uuid;
BEGIN
  FOR r IN SELECT id AS deck_id FROM public.decks LOOP
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
       SET head_version_id = v_head, updated_at = now()
     WHERE id = v_main;

    UPDATE public.decks
       SET current_branch_id = v_main
     WHERE id = r.deck_id AND current_branch_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.deck_versions
  ALTER COLUMN branch_id SET NOT NULL;

-- `current_branch_id` stays nullable so a new deck row can be inserted before the
-- AFTER INSERT trigger attaches the `main` branch (see `decks_create_main_branch`).

CREATE INDEX IF NOT EXISTS deck_versions_branch_timeline_idx
  ON public.deck_versions (deck_id, branch_id, created_at DESC);

-- ─── New deck → main branch ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decks_create_main_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  bid uuid;
BEGIN
  INSERT INTO public.deck_branches (deck_id, name)
  VALUES (NEW.id, 'main')
  RETURNING id INTO bid;

  UPDATE public.decks
     SET current_branch_id = bid
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decks_create_main_branch_trg ON public.decks;
CREATE TRIGGER decks_create_main_branch_trg
AFTER INSERT ON public.decks
FOR EACH ROW
EXECUTE FUNCTION public.decks_create_main_branch();

-- ─── Snapshot RPC (branch-scoped parent + head bump) ────────────────────────

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
  v_branch_id uuid;
  v_parent uuid;
BEGIN
  SELECT * INTO deck_row
    FROM public.decks
   WHERE id = p_deck_id;

  IF deck_row IS NULL THEN
    RAISE EXCEPTION 'Deck not found';
  END IF;

  v_branch_id := deck_row.current_branch_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Deck has no current branch; retry after deck is initialized';
  END IF;

  SELECT head_version_id INTO v_parent
    FROM public.deck_branches
   WHERE id = v_branch_id AND deck_id = p_deck_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found for deck';
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
    (deck_id, parent_id, branch_id, name, is_bookmarked, tags, change_summary, snapshot, created_by)
  VALUES
    (
      p_deck_id,
      COALESCE(p_parent_id, v_parent),
      v_branch_id,
      p_name,
      COALESCE(p_is_bookmarked, false),
      '{}'::text[],
      COALESCE(NULLIF(p_change_summary, ''), 'Updated deck'),
      snap,
      p_created_by
    )
  RETURNING * INTO new_version;

  UPDATE public.deck_branches
     SET head_version_id = new_version.id,
         updated_at = now()
   WHERE id = v_branch_id;

  RETURN new_version;
END;
$$;

-- ─── Revert: restore snapshot + follow version's branch ─────────────────────

CREATE OR REPLACE FUNCTION public.revert_deck_to_version(p_deck_id uuid, p_version_id uuid)
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
         current_branch_id = COALESCE(v_branch, current_branch_id),
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

-- ─── Apply arbitrary snapshot (merge result) without recording a version ───

CREATE OR REPLACE FUNCTION public.apply_deck_snapshot_json(p_deck_id uuid, p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('idlebrew.skip_deck_versions', 'on', true);

  UPDATE public.decks
     SET name = COALESCE(p_snapshot->'deck'->>'name', name),
         description = p_snapshot->'deck'->>'description',
         format = p_snapshot->'deck'->>'format',
         budget_usd = NULLIF(p_snapshot->'deck'->>'budget_usd', '')::numeric,
         bracket = NULLIF(p_snapshot->'deck'->>'bracket', '')::integer,
         is_public = COALESCE((p_snapshot->'deck'->>'is_public')::boolean, is_public),
         cover_image_scryfall_id = NULLIF(p_snapshot->'deck'->>'cover_image_scryfall_id', ''),
         commander_scryfall_ids = COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'deck'->'commanders')),
           '{}'::text[]
         ),
         primer_markdown = COALESCE(p_snapshot->>'primer_markdown', ''),
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
  FROM jsonb_array_elements(p_snapshot->'cards') c;
END;
$$;

-- ─── Switch branch: move HEAD pointer + load working tree ───────────────────

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
    PERFORM public.revert_deck_to_version(p_deck_id, v_head);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_deck_snapshot_json(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_deck_branch(uuid, uuid) TO authenticated;

-- ─── RLS for deck_branches ──────────────────────────────────────────────────

ALTER TABLE public.deck_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deck branches visible if deck is visible"
  ON public.deck_branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_branches.deck_id
        AND (d.is_public OR d.user_id = (select auth.uid()))
    )
  );

CREATE POLICY "Owner can insert deck branches"
  ON public.deck_branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_branches.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Owner can update deck branches"
  ON public.deck_branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_branches.deck_id
        AND d.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_branches.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Owner can delete deck branches"
  ON public.deck_branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_branches.deck_id
        AND d.user_id = (select auth.uid())
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.deck_branches;
