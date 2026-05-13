-- Zone registry documentation migration.
--
-- The `deck_cards.zone` column was created as TEXT DEFAULT 'mainboard' in the
-- initial schema and already stores arbitrary strings. This migration:
--   1. Backfills any NULL zone values to 'mainboard' (defensive — column has
--      NOT NULL DEFAULT, but belt-and-suspenders for rows inserted via
--      service-role without the default).
--   2. Documents the canonical zone vocabulary in a comment.
--
-- Canonical zones as of this migration:
--   mainboard  – cards that count toward deck size / format legality
--   sideboard  – up to 15 cards (for formats that use a sideboard)
--   maybeboard – cards under consideration; excluded from all legality counts
--
-- Additional zones (e.g. custom boards) may be stored as arbitrary strings.
-- The application-level zone registry (src/lib/zones.ts) is the single source
-- of truth for zone semantics; this migration keeps the DB comment in sync.

UPDATE deck_cards
SET zone = 'mainboard'
WHERE zone IS NULL;

COMMENT ON COLUMN deck_cards.zone IS
  'Board zone for this card. Canonical values: mainboard, sideboard, maybeboard. Custom zones stored as arbitrary strings.';
