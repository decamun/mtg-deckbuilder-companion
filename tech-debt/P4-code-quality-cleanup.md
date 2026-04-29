# P4 · Code Quality Cleanup

**Status:** ⚠️ Active — most original items were completed and resolved docs were archived in `tech-debt/archive/`. This file now tracks only still-relevant cleanup work.

## Verified Done During Latest Audit

- Auth-gated deck reads already use `supabase.auth.getUser()` in `src/components/DecksSection.tsx` and `src/app/decks/[id]/page.tsx`.
- The unused `setSorting` setter is gone; `sorting` is now a read-only state value in `src/app/decks/[id]/page.tsx`.
- The singular `commander_scryfall_id` column is unused by app code and is dropped by `supabase/migrations/20260429000000_drop_commander_scryfall_id.sql`.
- Rename and duplicate deck actions are implemented in `src/components/DecksSection.tsx`; the resolved stub-action plan was archived.

## Remaining Work

### 1. Right-click context menu parity for stack and list views

**File:** `src/app/decks/[id]/page.tsx`

The visual view wraps each card in a `<ContextMenu>`, but stack and list views still expose card actions only through the 3-dot dropdown.

Make stack/list right-click behavior match the visual view. The existing dropdown content starts in `renderDropdownItems(c, groupName)` and can be reused after extracting a shared menu-content helper that renders either dropdown or context-menu primitives.

### 2. Deduplicate card action menu content

**File:** `src/app/decks/[id]/page.tsx`

The visual-view context menu and 3-dot dropdown maintain separate action lists. Extract a single helper so commander, cover image, printing, finish, tag, and remove-card actions cannot drift apart.

### 3. Extract pure builders from `createDeck`

**File:** `src/components/BrewSection.tsx`

`createDeck` still handles Supabase inserts, commander setup, Sol Ring lookup, EDHREC fetches, land budgeting, card splitting, and row assembly in one large function. Extract pure helpers:

- `buildBasicLandPlan(colorIdentity, edhrecLandSlots)` -> array of `{ name, count }`
- `splitEdhrecCardsByType(cards: ScryfallCard[])` -> `{ lands, spells }`
- `assembleDeckRows(deckId, commander, edhrec, basics, solRing)` -> insert rows
