-- Deleting a deck CASCADE-deletes deck_cards. Each deleted card row fires
-- deck_cards_record_version → create_deck_version_snapshot(), which SELECTs
-- the parent deck. During referential cascades from the same DELETE statement,
-- that SELECT can return no row (the deck row is not visible to the trigger
-- chain), so create_deck_version_snapshot raised 'Deck not found' and the
-- client delete failed.
--
-- Reuse the existing idlebrew.skip_deck_versions session flag (see
-- revert_deck_to_version and record_deck_card_version) so CASCADE-driven card
-- deletes skip version snapshots while the deck row is being removed.

CREATE OR REPLACE FUNCTION public.skip_deck_versions_for_deleting_deck()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('idlebrew.skip_deck_versions', 'on', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS decks_before_delete_skip_version_snapshots ON public.decks;
CREATE TRIGGER decks_before_delete_skip_version_snapshots
  BEFORE DELETE ON public.decks
  FOR EACH ROW
  EXECUTE FUNCTION public.skip_deck_versions_for_deleting_deck();
