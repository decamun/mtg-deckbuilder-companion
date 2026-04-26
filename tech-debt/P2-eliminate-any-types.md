# P2 · Eliminate `any` Types Across `src/`

**Status:** ❌ Not started — and the surface area has grown since this doc was written.

## Background

A current audit (`grep -rn ": any" src/`) returns **9** uses of `any`, across both old and new code:

| File:Line | Pattern | Origin |
|---|---|---|
| `src/lib/mcp.ts:18` | `data.data?.slice(0, 5).map((c: any) => …)` | original doc |
| `src/app/decks/[id]/page.tsx:43` | `useState<any>(null)` for `deck` | original doc |
| `src/app/decks/[id]/page.tsx:452` | `onValueChange={(v: any) => setGrouping(v)}` | original doc |
| `src/app/decks/[id]/page.tsx:463` | `onValueChange={(v: any) => setViewMode(v)}` | original doc |
| `src/app/login/page.tsx:46` | `catch (error: any)` (sign-in/sign-up) | rolled in from P1 |
| `src/app/login/page.tsx:68` | `catch (error: any)` (forgot password) | rolled in from P1 |
| `src/app/auth/reset-password/page.tsx:59` | `catch (error: any)` | new since plan |
| `src/app/brew/page.tsx:219` | `catch (err: any)` | new since plan |
| `src/app/brew/page.tsx:150` | `(card as any).color_identity` | new since plan |
| `src/app/api/edhrec/[slug]/route.ts:22` | `function normalise(data: any)` | new since plan |
| `src/app/api/edhrec/[slug]/route.ts:79` | `const cardlists: any[] = …` | new since plan |

(11 distinct sites — 9 explicit `: any` + 2 `as any`. The grep undercounts `as any` casts.)

The fix is largely the original plan, expanded.

## Phase 1 — Shared Types Module

**New file:** `src/lib/types.ts`

```ts
// ─── Database shapes ────────────────────────────────────────────────────────

export interface Deck {
  id: string
  name: string
  format: string | null
  cover_image_scryfall_id: string | null
  commander_scryfall_ids: string[]      // added in 20240419000001_commander_array.sql
  user_id: string
  created_at: string
  description?: string | null
  cover_url?: string                    // client-side augmented
}

export interface DeckCard {
  id: string
  deck_id: string
  scryfall_id: string
  name: string
  quantity: number
  zone: string
  tags: string[]
  // Runtime-populated from Scryfall
  image_url?: string
  type_line?: string
  mana_cost?: string
  cmc?: number
}

// ─── View state ─────────────────────────────────────────────────────────────

export type ViewMode = 'visual' | 'stack' | 'list'
export type GroupingMode = 'none' | 'type' | 'mana' | 'tag'
export type SortingMode = 'name' | 'mana'
```

> [!NOTE]
> The schema added `commander_scryfall_ids: text[]` (see `supabase/migrations/20240419000001_commander_array.sql`). The shared `Deck` type captures this, which in turn lets us drop `(card as any).color_identity` once `ScryfallCard` is extended (next phase).

## Phase 2 — Extend `ScryfallCard`

**File:** `src/lib/scryfall.ts`

`ScryfallCard` is missing `color_identity` and `cmc`. `src/app/brew/page.tsx:150` casts to `any` to read `color_identity`. Add the fields:

```ts
export interface ScryfallCard {
  id: string
  name: string
  type_line: string
  mana_cost: string
  oracle_text: string
  cmc?: number
  color_identity?: string[]   // ["W","U",…]
  image_uris?: { normal: string; small: string }
}
```

Then drop the `(card as any)` cast in `brew/page.tsx`.

## Phase 3 — Update `src/app/decks/[id]/page.tsx`

1. Remove the local `DeckCard` interface (lines 20–31).
2. Import shared types:
   ```ts
   import type { Deck, DeckCard, ViewMode, GroupingMode, SortingMode } from "@/lib/types"
   ```
3. Type the `deck` state:
   ```ts
   const [deck, setDeck] = useState<Deck | null>(null)
   ```
4. Type the view-state hooks:
   ```ts
   const [viewMode, setViewMode] = useState<ViewMode>('visual')
   const [grouping, setGrouping] = useState<GroupingMode>('type')
   const [sorting, setSorting] = useState<SortingMode>('name')
   ```
5. Replace the two `(v: any)` callbacks with proper casts:
   ```tsx
   onValueChange={(v) => setGrouping(v as GroupingMode)}
   onValueChange={(v) => setViewMode(v as ViewMode)}
   ```

## Phase 4 — Update `src/app/decks/page.tsx`

1. Remove the local `Deck` interface (lines 19–25).
2. Import:
   ```ts
   import type { Deck } from "@/lib/types"
   ```
3. Type the `inserts` array in `handleCreateDeck`:
   ```ts
   const inserts: Array<{ deck_id: string; scryfall_id: string; name: string; quantity: number }> = []
   ```

## Phase 5 — Narrow Catch Blocks

Replace `catch (error: any)` / `catch (err: any)` with `unknown` in:

- `src/app/login/page.tsx:46` and `:68`
- `src/app/auth/reset-password/page.tsx:59`
- `src/app/brew/page.tsx:219`

Use the standard pattern:
```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'An unexpected error occurred'
  toast.error(message)
}
```

## Phase 6 — Tighten `src/lib/mcp.ts`

```ts
import type { ScryfallCard } from "@/lib/scryfall"
// …
const cards = (data.data as ScryfallCard[] | undefined)
  ?.slice(0, 5)
  .map((c) => `${c.name} - ${c.mana_cost} - ${c.type_line}`) || []
```

## Phase 7 — Tighten `src/app/api/edhrec/[slug]/route.ts`

This route maps several heterogeneous EDHREC response shapes onto a single decklist string. The `any` is somewhat justified at the JSON boundary, but we can do better with a discriminated union:

```ts
type EdhrecPayload =
  | { deck: string }
  | { decklist: string }
  | { deck: { decklist: string } }
  | { names: string[]; qty: number[] }

function normalise(data: unknown): { decklist: string } | null {
  const d = data as Partial<EdhrecPayload> & Record<string, unknown>
  // narrow each shape with `typeof`/`Array.isArray` as today
}
```

For the `cardlists` block at line 79, define a minimal interface:

```ts
interface Cardview { label?: string; name?: string; inclusion?: number; num_decks?: number }
interface Cardlist { cardviews?: Cardview[] }
const cardlists: Cardlist[] = data?.container?.json_dict?.cardlists ?? []
```

## Phase 8 — Verify

```bash
docker-compose exec web npx tsc --noEmit
docker-compose exec web npm run lint
```

Zero `any` warnings should remain. `grep -rn ": any\|as any" src/ | wc -l` should report `0`.

## Files Touched

| File | Action |
|---|---|
| `src/lib/types.ts` | **[NEW]** Shared `Deck`, `DeckCard`, view-state unions |
| `src/lib/scryfall.ts` | Add `cmc`, `color_identity` to `ScryfallCard` |
| `src/app/decks/[id]/page.tsx` | Use shared types; fix two `(v: any)` casts; type `deck` state |
| `src/app/decks/page.tsx` | Use shared `Deck`; type `inserts` |
| `src/app/login/page.tsx` | `catch (error: unknown)` ×2 |
| `src/app/auth/reset-password/page.tsx` | `catch (error: unknown)` |
| `src/app/brew/page.tsx` | `catch (err: unknown)`; drop `(card as any).color_identity` |
| `src/lib/mcp.ts` | Replace `(c: any)` with `ScryfallCard` cast |
| `src/app/api/edhrec/[slug]/route.ts` | Narrow `normalise` and `cardlists` shapes |
