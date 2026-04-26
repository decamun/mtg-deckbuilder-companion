# P1 · Scryfall Batching & In-Memory Cache

**Status:** ⚠️ Partial — batching shipped; module-level cache and a few hygiene items still pending.

## Background

`fetchDeck` in `src/app/decks/[id]/page.tsx` used to fire one Scryfall request per card via `getCard(scryfall_id)` inside a `Promise.all`. Decks of any size hit Scryfall's ~10 req/s ceiling and produced 429s, especially because every Supabase realtime `deck_cards` event re-runs `fetchDeck`. The deck-index page (`/decks`) and the new `/brew` flow have the same hot path for cover images and EDHREC import respectively.

Since this doc was written:

- A reusable `fetchCollection` helper plus two thin wrappers (`getCardsByIds`, `getCardsCollection`) were added to `src/lib/scryfall.ts:47`. They chunk requests at 75 identifiers and sleep 150ms between chunks.
- `fetchDeck` in `src/app/decks/[id]/page.tsx:166` now uses `getCardsByIds` and resolves card hydration in one batched POST.
- `MyDecks` in `src/app/decks/page.tsx:61` uses `getCardsByIds` for cover images.
- `/brew`'s `createDeck` uses `getCardsCollection` to resolve EDHREC card names.
- Error handling on the deck/cards Supabase queries now exists at `src/app/decks/[id]/page.tsx:138-163`.

## Resolution Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Module-level cache | ❌ Pending | No `cardCache` exists. Every realtime event re-batches every card from Scryfall. |
| Phase 2 — Batch hydration in `fetchDeck` | ✅ Done | Uses `getCardsByIds` directly. |
| Phase 3 — Error handling in `fetchDeck` | ✅ Done | `deckError` and `cardsError` are checked and toasted. |
| Phase 4 — Smoke test | ✅ Done | Single `/cards/collection` call per deck load confirmed. |

## Remaining Work

### 1. Add a module-level cache (was Phase 1)

**File:** `src/lib/scryfall.ts`

Realtime updates currently round-trip the full deck back through Scryfall. Even though it's one batched request now, a 100-card EDH deck still moves ~200KB across the wire on every tag edit.

Add a simple `Map<string, ScryfallCard>` and check it in both `getCard` and the new wrapper:

```ts
const cardCache = new Map<string, ScryfallCard>()

export async function getCard(id: string): Promise<ScryfallCard | null> {
  if (cardCache.has(id)) return cardCache.get(id)!
  // ... existing fetch logic, then cardCache.set(id, card)
}

export async function getCardsByIdsCached(ids: string[]): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>()
  const missing: string[] = []
  for (const id of ids) {
    const hit = cardCache.get(id)
    if (hit) out.set(id, hit)
    else missing.push(id)
  }
  if (missing.length) {
    const fetched = await getCardsByIds(missing)
    for (const c of fetched) {
      cardCache.set(c.id, c)
      out.set(c.id, c)
    }
  }
  return out
}
```

Then update three call sites to use the cached helper:
- `src/app/decks/[id]/page.tsx:166`
- `src/app/decks/page.tsx:61` (cover-image batch)
- `src/app/brew/page.tsx` Scryfall lookups

### 2. Move `calculateCmc` out of the component

`calculateCmc` is still defined inside `DeckWorkspace` at `src/app/decks/[id]/page.tsx:182`. It has no closure over component state. Hoist it to module scope (or into `src/lib/scryfall.ts`) so it isn't re-allocated on every render and can be unit-tested.

### 3. Re-evaluate `mana_cost`-only CMC

`calculateCmc` parses `{X}` as 1 and unrecognised tokens as 1. Scryfall returns a `cmc` field directly on `ScryfallCard`; consider preferring `sf.cmc` and falling back to the parser only when `cmc` is absent. (Add `cmc?: number` to the `ScryfallCard` interface in `src/lib/scryfall.ts:1`.)

## Files to Touch

| File | Action |
|---|---|
| `src/lib/scryfall.ts` | Add `cardCache`; wrap `getCard`; export `getCardsByIdsCached`; surface `cmc` on `ScryfallCard` |
| `src/app/decks/[id]/page.tsx` | Switch to cached helper; hoist `calculateCmc` to module scope |
| `src/app/decks/page.tsx` | Switch cover-image batch to cached helper |
| `src/app/brew/page.tsx` | Switch EDHREC card lookup to cached helper |

## Smoke Test (after changes)

1. `docker-compose up`.
2. Open a deck → DevTools Network → filter `scryfall.com`. Confirm one `/cards/collection` request on first load.
3. Add a card via the search bar — confirm the realtime refresh produces **zero** Scryfall requests for previously-loaded cards.
4. Navigate `/decks → /decks/[id] → /decks` — cover images and deck cards should hit cache, no Scryfall traffic.
