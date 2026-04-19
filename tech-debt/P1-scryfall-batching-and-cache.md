# P1 · Fix N+1 Scryfall Calls in Deck Workspace

## Background

Every time `fetchDeck` runs in `src/app/decks/[id]/page.tsx` it calls `getCard(scryfall_id)` **once per card** inside a `Promise.all`. A 60-card deck fires 60 individual HTTP requests to `https://api.scryfall.com/cards/:id`. Scryfall enforces ~10 req/s; larger decks will hit 429s. The problem is compounded because every Supabase realtime Postgres-change event also re-calls `fetchDeck`, so any mutation (adding a card, changing a tag) re-fetches all card art.

A working batch endpoint (`getCardsCollection`) already exists in `src/lib/scryfall.ts`. This task wires it up properly and adds a module-level cache.

---

## Phase 1 — Add an In-Memory Scryfall Card Cache

**File to edit:** `src/lib/scryfall.ts`

### Steps

1. At the top of the file (before any exports), declare a module-level `Map` cache:
   ```ts
   const cardCache = new Map<string, ScryfallCard>();
   ```

2. Wrap the existing `getCard(id)` function body to check the cache first:
   ```ts
   export async function getCard(id: string): Promise<ScryfallCard | null> {
     if (cardCache.has(id)) return cardCache.get(id)!;
     try {
       const res = await fetch(`https://api.scryfall.com/cards/${id}`);
       if (!res.ok) return null;
       const card = await res.json();
       cardCache.set(id, card);
       return card;
     } catch (error) {
       console.error("Scryfall getCard error:", error);
       return null;
     }
   }
   ```

3. Add a new exported helper `getCardsCached(ids: string[]): Promise<ScryfallCard[]>` that:
   - Splits the list into cached vs. uncached IDs.
   - Fetches uncached IDs via `getCardsCollection` (which already does chunking + rate-limit delay).
   - Stores results back into `cardCache`.
   - Returns a unified list preserving original order.

   ```ts
   export async function getCardsCached(ids: string[]): Promise<Map<string, ScryfallCard>> {
     const result = new Map<string, ScryfallCard>();
     const uncached: string[] = [];

     for (const id of ids) {
       if (cardCache.has(id)) {
         result.set(id, cardCache.get(id)!);
       } else {
         uncached.push(id);
       }
     }

     if (uncached.length > 0) {
       // getCardsCollection accepts names; we need IDs — use the id: variant
       const fetched = await getCardsByIds(uncached);
       for (const card of fetched) {
         cardCache.set(card.id, card);
         result.set(card.id, card);
       }
     }

     return result;
   }
   ```

4. Add a companion `getCardsByIds(ids: string[])` function that POSTs to `/cards/collection` using the `{ id: "..." }` identifier format (Scryfall supports both `name` and `id` identifiers in the collection endpoint):
   ```ts
   async function getCardsByIds(ids: string[]): Promise<ScryfallCard[]> {
     const CHUNK_SIZE = 75;
     const all: ScryfallCard[] = [];
     for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
       const chunk = ids.slice(i, i + CHUNK_SIZE);
       const identifiers = chunk.map(id => ({ id }));
       try {
         const res = await fetch('https://api.scryfall.com/cards/collection', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ identifiers }),
         });
         if (!res.ok) { console.error("Scryfall byIds error:", await res.text()); continue; }
         const json = await res.json();
         if (json.data) all.push(...json.data);
       } catch (e) {
         console.error("Scryfall getCardsByIds error:", e);
       }
       if (i + CHUNK_SIZE < ids.length) await new Promise(r => setTimeout(r, 150));
     }
     return all;
   }
   ```

5. Export `getCardsCached` so the deck workspace can import it.

---

## Phase 2 — Refactor `fetchDeck` to Use the Batch Cache

**File to edit:** `src/app/decks/[id]/page.tsx`

### Steps

1. Update the import line at the top to include `getCardsCached`:
   ```ts
   import { searchCards, getCardsCached, ScryfallCard } from "@/lib/scryfall"
   ```

2. Remove the old `getCard` import.

3. Replace the card hydration loop inside `fetchDeck`:

   **Before:**
   ```ts
   const hydrated = await Promise.all(cardsData.map(async (c) => {
     const sf = await getCard(c.scryfall_id)
     return { ...c, image_url: sf?.image_uris?.normal, ... }
   }))
   ```

   **After:**
   ```ts
   const ids = cardsData.map(c => c.scryfall_id);
   const sfMap = await getCardsCached(ids);
   const hydrated = cardsData.map(c => {
     const sf = sfMap.get(c.scryfall_id);
     return {
       ...c,
       image_url: sf?.image_uris?.normal,
       type_line: sf?.type_line ?? '',
       mana_cost: sf?.mana_cost ?? '',
       cmc: sf ? calculateCmc(sf.mana_cost) : 0,
     };
   });
   setCards(hydrated);
   ```

4. Move `calculateCmc` **outside** the component function (it has no dependencies on props or state). Place it above the `export default function DeckWorkspace` line.

---

## Phase 3 — Add Error Handling to `fetchDeck`

**File to edit:** `src/app/decks/[id]/page.tsx`

While refactoring `fetchDeck`, also fix the silent error swallowing (P1 Bug #2):

1. Destructure `error` from both Supabase queries:
   ```ts
   const [{ data: deckData, error: deckError }, { data: cardsData, error: cardsError }] = await Promise.all([...])
   ```

2. After the `Promise.all`, add guards:
   ```ts
   if (deckError) { toast.error("Failed to load deck"); return; }
   if (cardsError) { toast.error("Failed to load cards"); return; }
   if (!deckData) { router.push('/decks'); return; }
   ```

---

## Phase 4 — Smoke Test

1. Start the dev environment: `docker-compose up`
2. Open a deck with at least 10 cards.
3. Open DevTools → Network tab → filter by `scryfall.com`.
4. Verify only **one** request is made to `/cards/collection` (not N requests to `/cards/:id`).
5. Trigger a realtime update (add a card from the search sidebar).
6. Verify the already-fetched cards do **not** result in new Scryfall requests (cache hit).
7. Reload the page — cards should appear without 429 errors.

---

## Files Changed

| File | Action |
|---|---|
| `src/lib/scryfall.ts` | Add `cardCache`, `getCardsByIds`, `getCardsCached`; wrap `getCard` with cache |
| `src/app/decks/[id]/page.tsx` | Use `getCardsCached`, move `calculateCmc` out of component, add error handling |
