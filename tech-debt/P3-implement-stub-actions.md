# P3 · Implement Stub Menu Actions (Rename, Duplicate, Cover Image)

## Background

Three visible menu items silently do nothing:

- **Rename** and **Duplicate** in the deck card dropdown (`decks/page.tsx` lines 260–264).
- **Set as Cover Image** and **Set as Commander** in the card context menu (`decks/[id]/page.tsx` lines 296–297).

The `cover_image_scryfall_id` column already exists on the `decks` table. Rename and Duplicate require only simple Supabase operations. "Set as Commander" is more complex (requires a commander column/table) — this plan scopes it to a disabled state until a later task.

---

## Phase 1 — Implement Rename Deck

**File:** `src/app/decks/page.tsx`

### Steps

1. Add state for the rename dialog:
   ```ts
   const [renameDeckId, setRenameDeckId] = useState<string | null>(null)
   const [renameValue, setRenameValue] = useState("")
   ```

2. Add a `handleRename` function:
   ```ts
   const handleRename = async () => {
     if (!renameDeckId || !renameValue.trim()) return
     const { error } = await supabase
       .from('decks')
       .update({ name: renameValue.trim() })
       .eq('id', renameDeckId)
     if (error) {
       toast.error(error.message)
     } else {
       setDecks(decks.map(d => d.id === renameDeckId ? { ...d, name: renameValue.trim() } : d))
       toast.success("Deck renamed")
     }
     setRenameDeckId(null)
     setRenameValue("")
   }
   ```

3. Wire the Rename menu item:
   ```tsx
   onClick={(e) => {
     e.stopPropagation()
     const deck = decks.find(d => d.id === deck.id)
     setRenameValue(deck?.name ?? "")
     setRenameDeckId(deck.id)
   }}
   ```

4. Add a `<Dialog>` for the rename prompt below the existing create dialog:
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

---

## Phase 2 — Implement Duplicate Deck

**File:** `src/app/decks/page.tsx`

1. Add a `handleDuplicate` function:
   ```ts
   const handleDuplicate = async (deckId: string, e: React.MouseEvent) => {
     e.stopPropagation()
     const original = decks.find(d => d.id === deckId)
     if (!original) return

     const { data: { user } } = await supabase.auth.getUser()
     if (!user) return

     // 1. Create the new deck
     const { data: newDeck, error: deckError } = await supabase
       .from('decks')
       .insert({ name: `${original.name} (Copy)`, user_id: user.id, format: original.format })
       .select()
       .single()
     if (deckError) { toast.error(deckError.message); return }

     // 2. Copy all cards
     const { data: cards } = await supabase
       .from('deck_cards')
       .select('scryfall_id, name, quantity, zone, tags')
       .eq('deck_id', deckId)

     if (cards && cards.length > 0) {
       const inserts = cards.map(c => ({ ...c, deck_id: newDeck.id }))
       const { error: cardsError } = await supabase.from('deck_cards').insert(inserts)
       if (cardsError) toast.error(`Cards copy failed: ${cardsError.message}`)
     }

     toast.success(`"${original.name}" duplicated`)
     fetchDecks()
   }
   ```

2. Wire the Duplicate menu item:
   ```tsx
   onClick={(e) => handleDuplicate(deck.id, e)}
   ```

---

## Phase 3 — Implement Set as Cover Image

**File:** `src/app/decks/[id]/page.tsx`

The card context menu already has "Set as Cover Image" as a stub.

1. Add a `setCoverImage` function:
   ```ts
   const setCoverImage = async (scryfallId: string) => {
     const { error } = await supabase
       .from('decks')
       .update({ cover_image_scryfall_id: scryfallId })
       .eq('id', deckId)
     if (error) toast.error(error.message)
     else toast.success("Cover image updated")
   }
   ```

2. Wire it in the context menu:
   ```tsx
   <ContextMenuItem onClick={() => setCoverImage(c.scryfall_id)}>
     Set as Cover Image
   </ContextMenuItem>
   ```

---

## Phase 4 — Disable "Set as Commander" with a Tooltip

"Set as Commander" requires a dedicated schema change (commander tracking). For now, mark it visually disabled so it doesn't silently do nothing:

```tsx
<ContextMenuItem disabled className="opacity-40 cursor-not-allowed">
  Set as Commander
  <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
</ContextMenuItem>
```

---

## Phase 5 — Smoke Test

1. `docker-compose up`
2. On `/decks`: open a deck's dropdown → click **Rename** → enter a new name → verify the card title updates immediately without a page reload.
3. Click **Duplicate** → verify a new deck card appears with `(Copy)` suffix.
4. Open the duplicated deck → verify all cards are present.
5. On `/decks/[id]`: right-click a card → **Set as Cover Image** → navigate back to `/decks` → verify the deck card now shows the selected card's art.

---

## Files Changed

| File | Action |
|---|---|
| `src/app/decks/page.tsx` | Add rename state + dialog; add `handleRename`; add `handleDuplicate`; wire menu items |
| `src/app/decks/[id]/page.tsx` | Add `setCoverImage`; wire context menu item; disable Commander item |
