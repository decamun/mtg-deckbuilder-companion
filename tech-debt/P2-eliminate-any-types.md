# P2 · Eliminate `any` Types in Deck Workspace

## Background

The deck workspace has three `any` usages that defeat TypeScript's safety guarantees:

1. `useState<any>(null)` for the deck object — the `Deck` interface already exists in `decks/page.tsx` but isn't shared.
2. `onValueChange={(v: any) => setGrouping(v)}` on `<Select>` — casts away the union type.
3. `onValueChange={(v: any) => setViewMode(v)}` on `<Tabs>` — same pattern.
4. `(c: any)` in `mcp.ts` for mapped Scryfall results.

The fix is to create a shared types module and use it everywhere.

---

## Phase 1 — Create a Shared Types Module

**New file:** `src/lib/types.ts`

```ts
// ─── Database shapes ────────────────────────────────────────────────────────

export interface Deck {
  id: string;
  name: string;
  format: string | null;
  cover_image_scryfall_id: string | null;
  cover_url?: string; // client-side augmented
  user_id: string;
  created_at: string;
}

export interface DeckCard {
  id: string;
  deck_id: string;
  scryfall_id: string;
  name: string;
  quantity: number;
  zone: string;
  tags: string[];
  // Runtime-populated from Scryfall
  image_url?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
}

// ─── View state ─────────────────────────────────────────────────────────────

export type ViewMode = 'visual' | 'stack' | 'list';
export type GroupingMode = 'none' | 'type' | 'mana' | 'tag';
export type SortingMode = 'name' | 'mana';
```

---

## Phase 2 — Update `decks/[id]/page.tsx`

**File:** `src/app/decks/[id]/page.tsx`

1. Remove the local `DeckCard` interface definition (lines 20–32).
2. Add imports at the top:
   ```ts
   import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
   ```
3. Change the deck state type:
   ```ts
   // Before:
   const [deck, setDeck] = useState<any>(null)
   // After:
   const [deck, setDeck] = useState<Deck | null>(null)
   ```
4. Update the view mode and grouping state types:
   ```ts
   const [viewMode, setViewMode] = useState<ViewMode>('visual')
   const [grouping, setGrouping] = useState<GroupingMode>('type')
   const [sorting, setSorting] = useState<SortingMode>('name')
   ```
5. Fix the `<Select>` cast:
   ```ts
   // Before:
   onValueChange={(v: any) => setGrouping(v)}
   // After:
   onValueChange={(v) => setGrouping(v as GroupingMode)}
   ```
6. Fix the `<Tabs>` cast:
   ```ts
   // Before:
   onValueChange={(v: any) => setViewMode(v)}
   // After:
   onValueChange={(v) => setViewMode(v as ViewMode)}
   ```

---

## Phase 3 — Update `decks/page.tsx`

**File:** `src/app/decks/page.tsx`

1. Remove the local `Deck` interface definition.
2. Import from the shared module:
   ```ts
   import type { Deck } from "@/lib/types"
   ```
3. Type the `inserts` array explicitly:
   ```ts
   // Before:
   const inserts = []
   // After:
   const inserts: Array<{ deck_id: string; scryfall_id: string; name: string; quantity: number }> = []
   ```

---

## Phase 4 — Fix `any` in `mcp.ts`

**File:** `src/lib/mcp.ts`

1. Import the `ScryfallCard` type:
   ```ts
   import type { ScryfallCard } from "@/lib/scryfall"
   ```
2. Replace the anonymous map callback:
   ```ts
   // Before:
   data.data?.slice(0, 5).map((c: any) => ...)
   // After:
   (data.data as ScryfallCard[] | undefined)?.slice(0, 5).map((c) => ...)
   ```

---

## Phase 5 — Verify with TypeScript Compiler

Run inside the container:
```bash
docker-compose exec web npx tsc --noEmit
```

There should be zero type errors related to the changed files. If new errors surface (e.g., Supabase query return types not matching `Deck`), cast via `data as Deck` at the query site and leave a comment explaining the schema contract.

---

## Files Changed

| File | Action |
|---|---|
| `src/lib/types.ts` | **[NEW]** Shared domain types |
| `src/app/decks/[id]/page.tsx` | Remove local interfaces; use shared types; fix `any` casts |
| `src/app/decks/page.tsx` | Remove local `Deck` interface; type `inserts` array |
| `src/lib/mcp.ts` | Replace `(c: any)` with typed cast |
