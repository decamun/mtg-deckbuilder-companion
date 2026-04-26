# P4 · Code Quality Cleanup

**Status:** ⚠️ Partial — about half the original list shipped; new items have surfaced.

## Resolution Summary

| Original phase | Status | Notes |
|---|---|---|
| Phase 1 — Stack-view interactivity | ✅ Mostly done | Stack view now has a 3-dot dropdown menu (`renderThreeDotMenu` at `decks/[id]/page.tsx:377`). It still lacks a right-click `<ContextMenu>` like the visual view — see "Remaining 1" below. |
| Phase 2 — Unused icon imports | ✅ Done | Current imports at `decks/[id]/page.tsx:5` are all in use; the listed unused icons are gone. |
| Phase 3 — Hardcoded Tailwind colors | ❌ Pending | Both call-outs are still present in `decks/page.tsx`. |
| Phase 4 — Google logo SVG | ✅ Done | The original `src/app/page.tsx` was rewritten (now redirects to `/brew`). The login form moved to `src/app/login/page.tsx:163-184` and uses a proper inline Google SVG and a Facebook SVG. |
| Phase 5 — `docker-compose.yml` `version:` field | ❌ Pending | `version: '3.8'` still present at `docker-compose.yml:1`. |
| Phase 6 — `'use client'` on Supabase browser client | ❌ Pending | `src/lib/supabase/client.ts` is missing the directive. The file now also exports a `createClient()` factory and a default `supabase` singleton, so the directive prevents accidental server import of the singleton. |

## Remaining Work

### 1. Right-click context menu for stack view

**File:** `src/app/decks/[id]/page.tsx`

The visual view (lines 503–588) wraps each card in a `<ContextMenu>` so right-click pops up the same menu as the 3-dot dropdown. The stack view (lines 593–686) and list view (lines 689–711) only show the 3-dot dropdown — no right-click parity.

The dropdown content is already factored into `renderDropdownItems(c, groupName)` at line 336. Wrap the `<motion.div>` for stack cards (around line 643) and the row `<div>` for list cards (around line 692) in a `<ContextMenu>` whose `<ContextMenuContent>` reuses those items. Mirror the visual-view structure but render `ContextMenuItem` instead of `DropdownMenuItem`. (Or refactor `renderDropdownItems` into a shared menu-content helper that takes the item component as a generic — possibly worth a small follow-up if duplication grows.)

### 2. Hardcoded Tailwind colors

**File:** `src/app/decks/page.tsx`

Two literals still bypass the design tokens:

1. Create button at line 216:
   ```tsx
   className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
   // → className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
   ```
2. Decklist textarea at line 212:
   ```tsx
   className="bg-black/50 border-white/10 min-h-[150px]"
   // → className="bg-background/50 border-border min-h-[150px]"
   ```

The `<DialogTrigger>` at line 170 already uses tokens (`bg-primary`) — it's only these two leaf elements.

### 3. Drop `version:` from `docker-compose.yml`

**File:** `docker-compose.yml`

Delete line 1 (`version: '3.8'`). The Compose spec ignores it and it surfaces a deprecation warning on every command. The agent compose file (`docker-compose.agent.yml`) should be checked too — if it has the same line, drop it.

### 4. `'use client'` on the Supabase browser client

**File:** `src/lib/supabase/client.ts`

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
// … rest unchanged
```

Why this matters now: the file exports both a factory (`createClient()`) and a top-level singleton (`supabase`). Without `'use client'`, importing `supabase` from a Server Component would silently instantiate a browser client on the server. The directive turns that into a build-time error.

While in this file, audit whether the `|| 'https://placeholder.supabase.co'` / `|| 'placeholder'` fallbacks (lines 5–6) still earn their keep. They mask missing env vars rather than failing fast at startup.

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

### 9. Schema mismatch in `Deck` interface

`src/app/decks/page.tsx:19` declares `Deck` with `cover_image_scryfall_id` but not `commander_scryfall_ids`, even though the `/decks` page now renders decks that have commanders. The shared types module proposed in `P2-eliminate-any-types.md` will fix this — flagging here for visibility.

## Files Touched (remaining work only)

| File | Action |
|---|---|
| `src/app/decks/[id]/page.tsx` | Add `<ContextMenu>` wrapping for stack and list views; deduplicate menu content |
| `src/app/decks/page.tsx` | Replace hardcoded indigo/black/white classes with design tokens |
| `docker-compose.yml` | Remove `version:` |
| `docker-compose.agent.yml` | Remove `version:` if present |
| `src/lib/supabase/client.ts` | Add `'use client'`; reconsider placeholder fallbacks |
| `src/app/decks/page.tsx`, `src/app/decks/[id]/page.tsx` | Swap `getSession()` for `getUser()` in auth-gated reads |
| `src/app/brew/page.tsx` | Extract pure builders out of `createDeck` |
| `supabase/migrations/<new>.sql` | Drop unused `commander_scryfall_id` (singular) column |
