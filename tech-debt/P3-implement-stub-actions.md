# P3 · Implement Stub Menu Actions (Rename, Duplicate)

**Status:** ⚠️ Partial — cover-image and commander wiring shipped; rename and duplicate still stubs.

## Background

Of the four stub menu items called out in the original plan, two are now real:

- **Set as Cover Image** — implemented at `src/app/decks/[id]/page.tsx:245` (`setAsCoverImage`). Toggles `decks.cover_image_scryfall_id`.
- **Set as Commander** — implemented at `src/app/decks/[id]/page.tsx:230` (`setAsCommander`). Writes to a new `decks.commander_scryfall_ids text[]` column (see `supabase/migrations/20240419000001_commander_array.sql`) and supports up to 2 commanders. Better than the "disable with tooltip" stopgap the original doc proposed.

Two are still TODO comments in `src/app/decks/page.tsx`:

- `:258` — `<DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* TODO rename */ }}>`
- `:261` — `<DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* TODO duplicate */ }}>`

This doc reduces to wiring those two items.

## Resolution Summary

| Phase | Status |
|---|---|
| Phase 1 — Rename Deck | ❌ Pending |
| Phase 2 — Duplicate Deck | ❌ Pending |
| Phase 3 — Set as Cover Image | ✅ Done |
| Phase 4 — Set as Commander | ✅ Done (full implementation, not the stub disable) |

## Remaining Work

### Phase 1 — Rename Deck

**File:** `src/app/decks/page.tsx`

1. Add dialog state near the existing `useState`s (around line 27):
   ```ts
   const [renameDeckId, setRenameDeckId] = useState<string | null>(null)
   const [renameValue, setRenameValue] = useState("")
   ```

2. Add a handler:
   ```ts
   const handleRename = async () => {
     if (!renameDeckId || !renameValue.trim()) return
     const newName = renameValue.trim()
     const { error } = await supabase
       .from('decks')
       .update({ name: newName })
       .eq('id', renameDeckId)
     if (error) {
       toast.error(error.message)
     } else {
       setDecks(decks.map(d => d.id === renameDeckId ? { ...d, name: newName } : d))
       toast.success("Deck renamed")
     }
     setRenameDeckId(null)
     setRenameValue("")
   }
   ```

3. Wire the existing menu item at `decks/page.tsx:258`:
   ```tsx
   onClick={(e) => {
     e.stopPropagation()
     setRenameValue(deck.name)
     setRenameDeckId(deck.id)
   }}
   ```
   (Note: `deck` is already in scope from the `decks.map` above — there's no need for the `decks.find` shown in the original plan.)

4. Add the dialog (next to the existing create-deck `<Dialog>`):
   ```tsx
   <Dialog open={!!renameDeckId} onOpenChange={(open) => !open && setRenameDeckId(null)}>
     <DialogContent className="bg-card border-border text-foreground">
       <DialogHeader><DialogTitle>Rename Deck</DialogTitle></DialogHeader>
       <div className="py-4">
         <Input
           value={renameValue}
           onChange={(e) => setRenameValue(e.target.value)}
           onKeyDown={(e) => e.key === 'Enter' && handleRename()}
           autoFocus
         />
       </div>
       <DialogFooter>
         <Button variant="ghost" onClick={() => setRenameDeckId(null)}>Cancel</Button>
         <Button onClick={handleRename}>Save</Button>
       </DialogFooter>
     </DialogContent>
   </Dialog>
   ```
   (`DialogFooter` isn't currently imported in this file — add it to the import list.)

### Phase 2 — Duplicate Deck

**File:** `src/app/decks/page.tsx`

1. Add a handler:
   ```ts
   const handleDuplicate = async (deckId: string, e: React.MouseEvent) => {
     e.stopPropagation()
     const original = decks.find(d => d.id === deckId)
     if (!original) return

     const { data: { user } } = await supabase.auth.getUser()
     if (!user) return

     const { data: newDeck, error: deckError } = await supabase
       .from('decks')
       .insert({
         name: `${original.name} (Copy)`,
         user_id: user.id,
         format: original.format,
         commander_scryfall_ids: (original as Deck).commander_scryfall_ids ?? [],
         cover_image_scryfall_id: original.cover_image_scryfall_id,
       })
       .select()
       .single()
     if (deckError) { toast.error(deckError.message); return }

     const { data: cards } = await supabase
       .from('deck_cards')
       .select('scryfall_id, name, quantity, zone, tags')
       .eq('deck_id', deckId)

     if (cards?.length) {
       const inserts = cards.map(c => ({ ...c, deck_id: newDeck.id }))
       const { error: cardsError } = await supabase.from('deck_cards').insert(inserts)
       if (cardsError) toast.error(`Cards copy failed: ${cardsError.message}`)
     }

     toast.success(`"${original.name}" duplicated`)
     fetchDecks()
   }
   ```

   Notes vs. the original plan:
   - Carry over `commander_scryfall_ids` and `cover_image_scryfall_id` so the duplicate isn't a stripped copy. The schema now includes `commander_scryfall_ids: text[]` (see `supabase/migrations/20240419000001_commander_array.sql`).
   - Once `src/lib/types.ts` exists (see `P2-eliminate-any-types.md`), drop the `(original as Deck)` cast.

2. Wire the existing menu item at `decks/page.tsx:261`:
   ```tsx
   onClick={(e) => handleDuplicate(deck.id, e)}
   ```

### Phases 3 & 4 — Already done

`setAsCoverImage` (`decks/[id]/page.tsx:245`) and `setAsCommander` (`decks/[id]/page.tsx:230`) are wired in both the visual-view `<ContextMenu>` (lines 549–562) and the shared three-dot dropdown (lines 338–351). No further work.

## Smoke Test

1. `docker-compose up`.
2. `/decks` → open a deck's dropdown → **Rename** → confirm the title updates without a page reload.
3. **Duplicate** → confirm a new card appears with `(Copy)` suffix; open it and verify all cards, commanders, and the cover image carry over.
4. Confirm right-click on a card in `/decks/[id]` still works for **Set as Cover Image** / **Set as Commander** (already working — just guarding against regressions).

## Files Touched

| File | Action |
|---|---|
| `src/app/decks/page.tsx` | Add rename state + dialog + handler; add `handleDuplicate`; wire two menu items; import `DialogFooter` |
| `src/app/decks/[id]/page.tsx` | None — Phase 3/4 already shipped |
