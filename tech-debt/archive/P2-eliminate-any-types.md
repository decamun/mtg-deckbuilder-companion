# P2 · Eliminate `any` Types Across `src/`

**Status:** ✅ Resolved — no `: any` or `as any` remains in `src/`. Verified via `grep -rn ": any\|as any" src/` (returns nothing) and `npx tsc --noEmit` (passes).

## Background

A pre-fix audit (`grep -rn ": any" src/`) returned 9 explicit `: any` plus 2 `as any` casts spread across the auth flow, the deck pages, the brew flow, and the MCP / EDHREC layers. They masked schema drift on `Deck`, swallowed Supabase error shapes in catch blocks, and bypassed the `ScryfallCard` interface when reading `color_identity`.

## Resolution Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Shared types module (`src/lib/types.ts`) | ✅ Done | Exports `Deck`, `DeckCard`, `ViewMode`, `GroupingMode`, `SortingMode`. |
| Phase 2 — Extend `ScryfallCard` (`cmc`, `color_identity`) | ✅ Done | `src/lib/scryfall.ts` interface now carries both. |
| Phase 3 — `decks/[id]/page.tsx` uses shared types | ✅ Done | Local `DeckCard` removed; `deck` state typed `Deck \| null`; view-state hooks typed; the two `(v: any)` callbacks now narrow with `as ViewMode`/`as GroupingMode`. `cmc` hydration prefers `sf.cmc` and falls back to `calculateCmc`. |
| Phase 4 — `decks/page.tsx` uses shared types | ✅ Done | Local `Deck` removed; `inserts` array typed; cover-image hydration unchanged. |
| Phase 5 — Narrow catch blocks | ✅ Done | `login/page.tsx` (×2), `auth/reset-password/page.tsx`, `brew/page.tsx` all use `catch (error: unknown)` + `instanceof Error` guards. |
| Phase 6 — Tighten `src/lib/mcp.ts` | ✅ Done | `data.data` cast to `ScryfallCard[] \| undefined`; unused `e` removed from catch. |
| Phase 7 — Tighten `src/app/api/edhrec/[slug]/route.ts` | ✅ Done | `normalise(data: unknown)` narrows by `typeof`/`Array.isArray`; `cardlists` typed via local `EdhrecCardlist` / `EdhrecCardview` interfaces. |
| Phase 8 — Verify | ✅ Done | `npx tsc --noEmit` clean; `grep -rn ": any\|as any" src/` returns 0 hits. |

## Verification

```bash
$ grep -rn ": any\|as any" src/ | wc -l
0
$ npx tsc --noEmit
# (no output, exit 0)
```

Lint problem count dropped from 44 (29 errors) to 32 (18 errors) on this branch. The remaining lint findings are unrelated React-hooks-rules and `react/no-unescaped-entities` errors in pre-existing legal pages — separate concerns, not introduced by this work.

## Files Touched

| File | Action |
|---|---|
| `src/lib/types.ts` | **[NEW]** Shared `Deck`, `DeckCard`, `ViewMode`, `GroupingMode`, `SortingMode` |
| `src/lib/scryfall.ts` | Added `cmc?: number`, `color_identity?: string[]` to `ScryfallCard` |
| `src/app/decks/[id]/page.tsx` | Removed local `DeckCard`; imported shared types; typed `deck`, `viewMode`, `grouping`, `sorting`; replaced `(v: any)` callbacks; `cmc` prefers `sf.cmc` |
| `src/app/decks/page.tsx` | Removed local `Deck`; imported shared `Deck`; typed `inserts` |
| `src/app/login/page.tsx` | `catch (error: unknown)` ×2 with `instanceof Error` guard |
| `src/app/auth/reset-password/page.tsx` | `catch (error: unknown)` with `instanceof Error` guard |
| `src/app/brew/page.tsx` | Dropped `(card as any).color_identity` (now reads `card.color_identity`); `catch (err: unknown)` with `instanceof Error` guard |
| `src/lib/mcp.ts` | Imports `ScryfallCard`; replaces `(c: any)` map with typed cast |
| `src/app/api/edhrec/[slug]/route.ts` | `normalise(data: unknown)` with structural narrowing; `EdhrecCardlist` / `EdhrecCardview` interfaces for the fallback path |

## Follow-ups (out of scope for this doc)

- `setSorting` in `decks/[id]/page.tsx` is declared but never called — pre-existing, surfaced by lint. Either wire up a sort selector or drop the setter. Tracked in `P4-code-quality-cleanup.md`.
- The `as ViewMode` / `as GroupingMode` casts on the `<Tabs>` / `<Select>` `onValueChange` are necessary because those primitives expose `(v: string) => void`. If shadcn primitives gain a generic, drop the cast.
