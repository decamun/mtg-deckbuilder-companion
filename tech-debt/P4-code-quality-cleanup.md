# P4 · Code Quality Cleanup

**Status:** ⚠️ Partial — original Phases 3, 5, 6 now shipped along with new item #9 (schema-mismatch resolved via shared `Deck` type from `P2-eliminate-any-types`). Right-click parity in stack/list views, the `getSession()` → `getUser()` swap, the `createDeck` extraction, the dead-column migration, and the menu deduplication remain.

## Resolution Summary

| Original phase | Status | Notes |
|---|---|---|
| Phase 1 — Stack-view interactivity | ✅ Mostly done | Stack view now has a 3-dot dropdown menu (`renderThreeDotMenu` at `decks/[id]/page.tsx:377`). It still lacks a right-click `<ContextMenu>` like the visual view — see "Remaining 1" below. |
| Phase 2 — Unused icon imports | ✅ Done | Current imports at `decks/[id]/page.tsx:5` are all in use; the listed unused icons are gone. |
| Phase 3 — Hardcoded Tailwind colors | ✅ Done | Both call-outs in `decks/page.tsx` (Create button + decklist textarea) now use design tokens (`bg-primary` / `bg-background/50` / `border-border` / `text-primary-foreground`). |
| Phase 4 — Google logo SVG | ✅ Done | The original `src/app/page.tsx` was rewritten (now redirects to `/brew`). The login form moved to `src/app/login/page.tsx:163-184` and uses a proper inline Google SVG and a Facebook SVG. |
| Phase 5 — `docker-compose.yml` `version:` field | ✅ Done | Removed from both `docker-compose.yml` and `docker-compose.agent.yml`. |
| Phase 6 — `'use client'` on Supabase browser client | ✅ Done | `src/lib/supabase/client.ts` now starts with `'use client'`, so importing the top-level `supabase` singleton from a Server Component is a build-time error. (The `\|\| 'placeholder'` env-var fallbacks at lines 5–6 were left untouched — a bigger conversation than this cleanup pass.) |

## Remaining Work

### 1. Right-click context menu for stack view

**File:** `src/app/decks/[id]/page.tsx`

The visual view (lines 503–588) wraps each card in a `<ContextMenu>` so right-click pops up the same menu as the 3-dot dropdown. The stack view (lines 593–686) and list view (lines 689–711) only show the 3-dot dropdown — no right-click parity.

The dropdown content is already factored into `renderDropdownItems(c, groupName)` at line 336. Wrap the `<motion.div>` for stack cards (around line 643) and the row `<div>` for list cards (around line 692) in a `<ContextMenu>` whose `<ContextMenuContent>` reuses those items. Mirror the visual-view structure but render `ContextMenuItem` instead of `DropdownMenuItem`. (Or refactor `renderDropdownItems` into a shared menu-content helper that takes the item component as a generic — possibly worth a small follow-up if duplication grows.)

### 2. Hardcoded Tailwind colors — ✅ Done

Both `decks/page.tsx` literals (Create button at line 216, decklist textarea at line 212) now use design tokens.

### 3. Drop `version:` from `docker-compose.yml` — ✅ Done

Removed from both `docker-compose.yml` and `docker-compose.agent.yml`.

### 4. `'use client'` on the Supabase browser client — ✅ Done

Directive added at top of `src/lib/supabase/client.ts`. The placeholder env-var fallbacks (`|| 'https://placeholder.supabase.co'`, `|| 'placeholder'`) on lines 5–6 are still in place — a separate audit can decide whether to fail fast on missing env instead.

## New Cleanup Items (added since the original plan)

These weren't in the original doc but came up while auditing:

### 5. `getSession()` vs `getUser()` for auth-gated reads

`getSession()` reads the local cookie without re-validating with Supabase. It's appropriate for cosmetic UI (e.g. `TopNav.tsx:30`) but **not** for redirect decisions. The middleware plan in `P2-auth-middleware.md` is the principled fix, but until it lands, swap these two sites to `getUser()`:

- `src/app/decks/page.tsx:42`
- `src/app/decks/[id]/page.tsx:131`

### 6. Duplicated context-menu content in `decks/[id]/page.tsx`

The visual view inlines the full menu in `<ContextMenuContent>` (lines 549–585) **and** also gets the same menu through `renderThreeDotMenu` → `renderDropdownItems` (lines 336–374). Two near-identical lists drift apart easily. Extract a single `cardMenuItems(c, groupName, ItemComponent)` helper used by both menus.

### 7. `createDeck` in `src/app/brew/page.tsx` is doing too much

`createDeck` (lines 89–225) inserts a deck, inserts the commander, fetches Sol Ring, fetches EDHREC, picks land budget, splits into lands/spells, and inserts everything. It's ~135 lines and untestable. Extract:

- `buildBasicLandPlan(colorIdentity, edhrecLandSlots)` → array of `{ name, count }`
- `splitEdhrecCardsByType(cards: ScryfallCard[])` → `{ lands, spells }`
- `assembleDeckRows(deckId, commander, edhrec, basics, solRing)` → row array

Then `createDeck` becomes a sequence of pure builders followed by Supabase inserts.

### 8. `commander_scryfall_id` (singular) is dead

The original `decks` schema has both `commander_scryfall_id text` (singular, from `20240418000000_init.sql`) and the new `commander_scryfall_ids text[]` (plural, from `20240419000001_commander_array.sql`). The migration backfills plural from singular but never drops the singular column — and no application code reads it any more. Add a follow-up migration that `ALTER TABLE … DROP COLUMN commander_scryfall_id` once we're confident no reader remains.

### 9. Schema mismatch in `Deck` interface — ✅ Done

`src/app/decks/page.tsx` no longer declares a local `Deck` interface; both deck pages now import the shared `Deck` type from `src/lib/types.ts`, which carries `commander_scryfall_ids: string[]` to match the schema.

### 10. Unused `setSorting` setter in `decks/[id]/page.tsx`

`const [sorting, setSorting] = useState<SortingMode>('name')` — `setSorting` is never called. Either wire up a sort selector in the toolbar (`name` vs. `mana`) or drop the setter and inline the constant. Surfaced by lint as `@typescript-eslint/no-unused-vars`.

## Files Touched (remaining work only)

| File | Action |
|---|---|
| `src/app/decks/[id]/page.tsx` | Add `<ContextMenu>` wrapping for stack and list views; deduplicate menu content; drop unused `setSorting` or wire it up |
| `src/app/decks/page.tsx`, `src/app/decks/[id]/page.tsx` | Swap `getSession()` for `getUser()` in auth-gated reads |
| `src/app/brew/page.tsx` | Extract pure builders out of `createDeck` |
| `supabase/migrations/<new>.sql` | Drop unused `commander_scryfall_id` (singular) column |
