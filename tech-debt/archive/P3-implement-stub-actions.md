# P3 · Implement Stub Menu Actions (Rename, Duplicate)

**Status:** ✅ Resolved. Rename and Duplicate are wired in `src/components/DecksSection.tsx`; cover-image and commander actions were already live in the deck editor.

## Background

Of the four stub menu items called out in the original plan, all are now real:

- **Set as Cover Image** — implemented at `src/app/decks/[id]/page.tsx:245` (`setAsCoverImage`). Toggles `decks.cover_image_scryfall_id`.
- **Set as Commander** — implemented at `src/app/decks/[id]/page.tsx:230` (`setAsCommander`). Writes to a new `decks.commander_scryfall_ids text[]` column (see `supabase/migrations/20240419000001_commander_array.sql`) and supports up to 2 commanders. Better than the "disable with tooltip" stopgap the original doc proposed.

- **Rename** — implemented in `src/components/DecksSection.tsx` with a dialog, Supabase update, local deck-list refresh, and success/error toasts.
- **Duplicate** — implemented in `src/components/DecksSection.tsx`; it copies deck metadata plus `deck_cards` rows, including printing, finish, oracle id, zone, quantity, and tags.

## Resolution Summary

| Phase | Status |
|---|---|
| Phase 1 — Rename Deck | ✅ Done |
| Phase 2 — Duplicate Deck | ✅ Done |
| Phase 3 — Set as Cover Image | ✅ Done |
| Phase 4 — Set as Commander | ✅ Done (full implementation, not the stub disable) |

## Resolution Notes

### Phase 1 — Rename Deck

`src/components/DecksSection.tsx` now keeps rename dialog state, opens the dialog from the deck dropdown, updates `decks.name`, and updates the rendered card title without a route change.

### Phase 2 — Duplicate Deck

`src/components/DecksSection.tsx` now inserts a private copy of the deck and then copies its card rows. It preserves commander ids, cover image, description, primer markdown, format, printings, finishes, oracle ids, zones, quantities, and tags.

### Phases 3 & 4

`setAsCoverImage` (`decks/[id]/page.tsx:245`) and `setAsCommander` (`decks/[id]/page.tsx:230`) are wired in both the visual-view `<ContextMenu>` (lines 549–562) and the shared three-dot dropdown (lines 338–351). No further work.

## Smoke Test

1. `docker-compose up`.
2. `/decks` → open a deck's dropdown → **Rename** → confirm the title updates without a page reload.
3. **Duplicate** → confirm a new card appears with `(Copy)` suffix; open it and verify all cards, commanders, and the cover image carry over.
4. Confirm right-click on a card in `/decks/[id]` still works for **Set as Cover Image** / **Set as Commander** (already working — just guarding against regressions).

## Files Touched

| File | Action |
|---|---|
| `src/components/DecksSection.tsx` | Add rename state + dialog + handler; add `handleDuplicate`; wire two menu items; import `DialogFooter` |
| `src/app/decks/[id]/page.tsx` | None — Phase 3/4 already shipped |
