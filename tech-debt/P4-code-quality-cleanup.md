# P4 · Code Quality Cleanup

## Background

Several small but non-trivial quality issues that each take under 15 minutes individually but are grouped here into a single agent task:

1. **Stack view lacks a context menu** — no way to interact with cards in that view.
2. **Unused icon imports** — `PlaySquare`, `Settings`, `ChevronDown`, `Edit2`, `Tag` imported but never used.
3. **Hardcoded Tailwind colors** bypass the design token system (`bg-indigo-500`, `bg-black/50`, `border-white/10`).
4. **`<Component>` icon** used as Google logo placeholder.
5. **`docker-compose.yml` `version:` field** triggers a warning on every command.
6. **`'use client'` missing from `supabase/client.ts`** — no explicit boundary marker.

---

## Phase 1 — Add Context Menu to Stack View

**File:** `src/app/decks/[id]/page.tsx`

The stack view (lines 323–344) renders cards without any interactive context menu, unlike the visual view.

Wrap each stack card `<div>` with the same `<ContextMenu>` / `<ContextMenuTrigger>` / `<ContextMenuContent>` pattern already used in the visual view. The context menu content can be identical — extract it into a local component or a render function to avoid duplication:

1. Extract the context menu content into a helper render function above the return statement:
   ```tsx
   const renderCardContextMenu = (c: DeckCard, groupName: string, children: React.ReactNode) => (
     <ContextMenu key={c.id}>
       <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
       <ContextMenuContent className="w-48 bg-card border-border text-foreground">
         <ContextMenuItem onClick={() => setCoverImage(c.scryfall_id)}>Set as Cover Image</ContextMenuItem>
         <ContextMenuItem disabled className="opacity-40">Set as Commander</ContextMenuItem>
         <ContextMenuSeparator className="bg-border" />
         <ContextMenuSub>
           <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
           <ContextMenuSubContent className="bg-card border-border text-foreground">
             {allUniqueTags.map(tag => (
               <ContextMenuItem key={tag} onClick={() => addTag(c.id, tag)}>{tag}</ContextMenuItem>
             ))}
             {allUniqueTags.length > 0 && <ContextMenuSeparator className="bg-border" />}
             <ContextMenuItem onClick={() => { setActiveCardIdForTag(c.id); setTagDialogOpen(true) }}>
               Add Custom Tag...
             </ContextMenuItem>
           </ContextMenuSubContent>
         </ContextMenuSub>
         <ContextMenuSeparator className="bg-border" />
         {grouping === 'tag' && groupName !== 'Untagged' && (
           <>
             <ContextMenuItem className="text-orange-400" onClick={() => removeTag(c.id, groupName)}>
               Remove from '{groupName}'
             </ContextMenuItem>
             <ContextMenuSeparator className="bg-border" />
           </>
         )}
         <ContextMenuItem className="text-destructive" onClick={() => deleteCard(c.id)}>
           Remove from Deck
         </ContextMenuItem>
       </ContextMenuContent>
     </ContextMenu>
   )
   ```

2. Refactor the visual view to call `renderCardContextMenu(c, groupName, <div ...>)`.
3. Wrap each stack card the same way: `renderCardContextMenu(c, groupName, <div className="relative w-40 ...">)`.

---

## Phase 2 — Remove Unused Icon Imports

**File:** `src/app/decks/[id]/page.tsx`

Line 5 currently imports: `Search, LayoutGrid, List, Layers as StackIcon, Settings, ChevronDown, Tag, Trash, Edit2, PlaySquare`

Remove the unused ones: `Settings`, `ChevronDown`, `Tag`, `Edit2`, `PlaySquare`

```ts
import { Search, LayoutGrid, List, Layers as StackIcon, Trash } from "lucide-react"
```

---

## Phase 3 — Fix Hardcoded Colors

**File:** `src/app/decks/page.tsx`

Two elements hardcode Tailwind colors that bypass the design token system:

1. Create deck button (line 218):
   ```tsx
   // Before:
   className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
   // After:
   className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
   ```

2. Decklist textarea (line 214):
   ```tsx
   // Before:
   className="bg-black/50 border-white/10 min-h-[150px]"
   // After:
   className="bg-background/50 border-border min-h-[150px]"
   ```

---

## Phase 4 — Fix Google OAuth Icon

**File:** `src/app/page.tsx`

The `<Component>` icon from `lucide-react` is used as a placeholder for the Google logo. Replace with a proper inline SVG:

1. Remove `Component` from the lucide import.
2. Replace `<Component className="w-4 h-4 mr-2" />` with:
   ```tsx
   <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
     <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
     <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
     <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
     <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
   </svg>
   ```

---

## Phase 5 — Fix `docker-compose.yml` Version Field

**File:** `docker-compose.yml` (project root)

Remove the obsolete top-level `version:` attribute that triggers a warning on every `docker-compose` command:

```yaml
# Remove this line:
version: '3.8'
```

The Compose spec no longer requires or uses this field.

---

## Phase 6 — Add `'use client'` to Supabase Client Module

**File:** `src/lib/supabase/client.ts`

Add `'use client'` as the first line to make the browser boundary explicit and prevent accidental server-side imports:

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
// ... rest unchanged
```

---

## Phase 7 — Smoke Test

1. `docker-compose up` — verify **no** `version` attribute warning in output.
2. Open `/decks/[id]` in the browser.
3. Switch to **Stack** view and right-click a card — verify the context menu appears with all expected items.
4. Open browser console — verify no TypeScript errors about unused variables (linting).
5. Open the **New Deck** dialog — verify the Create button uses the primary theme color (carrot orange), not indigo.
6. On the splash page, verify the Google button shows the proper Google logo SVG.

---

## Files Changed

| File | Action |
|---|---|
| `src/app/decks/[id]/page.tsx` | Extract context menu render fn; apply to stack view; remove unused imports |
| `src/app/decks/page.tsx` | Fix hardcoded `bg-indigo-500` and `bg-black/50` colors |
| `src/app/page.tsx` | Replace `<Component>` with Google SVG; remove `Component` import |
| `docker-compose.yml` | Remove `version:` field |
| `src/lib/supabase/client.ts` | Add `'use client'` directive |
