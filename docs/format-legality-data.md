# Format legality and list data

This project uses a **live-first** legality pipeline for deck-format checks.

## Sources of truth

- **Commander ban / legality status**: live `legalities.commander` from Scryfall card payloads (via `src/lib/scryfall.ts` hydration).
- **Commander bracket game-changer list**: `src/lib/game-changers.ts` fallback list sourced from WotC Commander bracket guidance. There is currently no stable export API for this list.

## Versioning and cache invalidation

- `getFormatValidationDataVersion()` in `src/lib/deck-format-validation.ts` emits a version stamp.
- Callers pass that stamp into `validateDeckForFormat(..., { dataVersion })`.
- Deck stats reports expose this as `format_validation.data_version` so hash-based caches can invalidate when list data changes.

## Failure behavior

- If Commander legality is missing from hydrated Scryfall data, validation emits `Cannot validate Commander legality: missing data from Scryfall` (no silent “empty list means all legal” behavior).
- If the fallback game-changer list is empty/malformed, `src/lib/game-changers.ts` throws on module load so startup/tests fail loudly.

## Refresh cadence and procedure

- **Scryfall legality data**: live when deck cards are hydrated from Scryfall (editor + deck stats), so legality updates are picked up on subsequent card fetches without an artifact refresh.
- **Game-changer fallback list**: refresh manually when WotC updates the bracket list.
  1. Update names and bump `GAME_CHANGER_DATA_VERSION` in `src/lib/game-changers.ts`.
  2. Run `npm test` and `npm run test:deck-format`.
  3. Commit both list and version bump together.
