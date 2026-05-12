# P4 · Code Quality Cleanup

**Status:** ⚠️ Active — most original items were completed and resolved docs were archived in `tech-debt/archive/`. This file now tracks only still-relevant cleanup work.

All remaining items below are tracked as GitHub issues. The tech-debt/archive/ directory has been removed; resolved plans were audited and all outstanding work migrated to issues.

## Verified Done During Latest Audit

- Auth-gated deck reads already use `supabase.auth.getUser()` in `src/components/DecksSection.tsx` and `src/app/decks/[id]/page.tsx`.
- The unused `setSorting` setter is gone; `sorting` is now a read-only state value in `src/app/decks/[id]/page.tsx`.
- The singular `commander_scryfall_id` column is unused by app code and is dropped by `supabase/migrations/20260429000000_drop_commander_scryfall_id.sql`.
- Rename and duplicate deck actions are implemented in `src/components/DecksSection.tsx`; the resolved stub-action plan was archived.

## Remaining Work (tracked as GitHub issues)

### 1. Right-click context menu parity for stack and list views

**Issue:** #133 — Tech debt: deck editor context menu parity + unified card actions

**File:** `src/app/decks/[id]/DeckWorkspaceClient.tsx` (confirm location before editing; menu logic may have moved)

### 2. Deduplicate card action menu content

**Issue:** #133 (same as above)

### 3. Extract pure builders from `createDeck`

**Issue:** #132 — Tech debt: extract pure helpers from BrewSection createDeck (closed — verify completion)

**File:** `src/components/BrewSection.tsx`

