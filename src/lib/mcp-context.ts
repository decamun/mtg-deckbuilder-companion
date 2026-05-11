import type { SupabaseClient } from '@supabase/supabase-js'
import * as deckService from './deck-service'

export interface McpContext {
  userId: string
  deckService: {
    listDecks: () => Promise<deckService.DeckRow[]>
    getDeck: (deckId: string) => Promise<deckService.DeckRow>
    getDecklist: (deckId: string) => Promise<deckService.DeckCardRow[]>
    addCard: (deckId: string, input: deckService.AddCardInput) => Promise<deckService.DeckCardRow>
    removeCard: (deckCardId: string) => Promise<void>
    setCardQuantity: (deckCardId: string, quantity: number) => Promise<deckService.DeckCardRow | null>
    addCardTag: (deckCardId: string, tag: string) => Promise<deckService.DeckCardRow>
    removeCardTag: (deckCardId: string, tag: string) => Promise<deckService.DeckCardRow>
    setCardTags: (deckCardId: string, tags: string[]) => Promise<deckService.DeckCardRow>
    setCardPrinting: (deckCardId: string, printingScryfallId: string | null) => Promise<deckService.DeckCardRow>
    setCardFinish: (deckCardId: string, finish: deckService.Finish) => Promise<deckService.DeckCardRow>
    setCommanders: (deckId: string, scryfallIds: string[]) => Promise<deckService.DeckRow>
    setCoverImage: (deckId: string, scryfallId: string | null) => Promise<deckService.DeckRow>
    setPrimer: (deckId: string, markdown: string) => Promise<deckService.DeckRow>
    patchPrimer: (deckId: string, oldString: string, newString: string) => Promise<deckService.DeckRow>
    listDeckBranches: (deckId: string) => Promise<deckService.DeckBranchRow[]>
    createDeckBranch: (deckId: string, name: string) => Promise<deckService.DeckBranchRow>
    switchDeckBranchByName: (deckId: string, branchName: string) => Promise<void>
    mergeDeckBranchByName: (
      deckId: string,
      sourceBranchName: string,
      conflictDefault: 'ours' | 'theirs'
    ) => Promise<{ conflictCount: number }>
  }
}

export function createMcpContext(supabase: SupabaseClient, userId: string): McpContext {
  return {
    userId,
    deckService: {
      listDecks: () => deckService.listDecks(supabase, userId),
      getDeck: (deckId) => deckService.getDeck(supabase, userId, deckId),
      getDecklist: (deckId) => deckService.getDecklist(supabase, userId, deckId),
      addCard: (deckId, input) => deckService.addCard(supabase, userId, deckId, input),
      removeCard: (deckCardId) => deckService.removeCard(supabase, userId, deckCardId),
      setCardQuantity: (deckCardId, quantity) =>
        deckService.setCardQuantity(supabase, userId, deckCardId, quantity),
      addCardTag: (deckCardId, tag) => deckService.addCardTag(supabase, userId, deckCardId, tag),
      removeCardTag: (deckCardId, tag) =>
        deckService.removeCardTag(supabase, userId, deckCardId, tag),
      setCardTags: (deckCardId, tags) =>
        deckService.setCardTags(supabase, userId, deckCardId, tags),
      setCardPrinting: (deckCardId, printingScryfallId) =>
        deckService.setCardPrinting(supabase, userId, deckCardId, printingScryfallId),
      setCardFinish: (deckCardId, finish) =>
        deckService.setCardFinish(supabase, userId, deckCardId, finish),
      setCommanders: (deckId, scryfallIds) =>
        deckService.setCommanders(supabase, userId, deckId, scryfallIds),
      setCoverImage: (deckId, scryfallId) =>
        deckService.setCoverImage(supabase, userId, deckId, scryfallId),
      setPrimer: (deckId, markdown) =>
        deckService.setPrimer(supabase, userId, deckId, markdown),
      patchPrimer: (deckId, oldString, newString) =>
        deckService.patchPrimer(supabase, userId, deckId, oldString, newString),
      listDeckBranches: (deckId) => deckService.listDeckBranches(supabase, userId, deckId),
      createDeckBranch: (deckId, name) => deckService.createDeckBranch(supabase, userId, deckId, name),
      switchDeckBranchByName: (deckId, branchName) =>
        deckService.switchDeckBranchByName(supabase, userId, deckId, branchName),
      mergeDeckBranchByName: (deckId, sourceBranchName, conflictDefault) =>
        deckService.mergeDeckBranchByName(supabase, userId, deckId, sourceBranchName, conflictDefault),
    },
  }
}
