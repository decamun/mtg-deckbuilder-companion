import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as deckService from './deck-service'
import { buildDeckStatsReport } from './deck-stats'
import { searchCards, getPrintingsByOracleId, type ScryfallCard } from './scryfall'

/** Names of tools that persist deck changes — client refreshes the editor after each completes. */
export const DECK_AGENT_MUTATING_TOOLS = new Set([
  'add_card',
  'remove_card',
  'set_card_quantity',
  'add_card_tag',
  'remove_card_tag',
  'set_card_tags',
  'set_card_printing',
  'set_card_finish',
  'set_commanders',
  'set_cover_image',
  'set_primer',
  'patch_primer',
  'create_deck_branch',
  'switch_deck_branch',
  'merge_deck_branch',
])

/**
 * Tools exposed to the in-app deck-editor agent.
 *
 * Each tool closes over (supabase, userId, deckId). The deckId is
 * forced — the agent cannot edit other decks even if the model hallucinates
 * one, because tools that take a deckId double-check it equals the bound deck.
 */
export function buildDeckAgentTools(
  supabase: SupabaseClient,
  userId: string,
  deckId: string
) {
  const enforceDeck = (id: string) => {
    if (id !== deckId) {
      throw new Error(`This conversation is bound to deck ${deckId}; cannot operate on ${id}`)
    }
  }

  return {
    search_scryfall: tool({
      description:
        'Search Scryfall using their full search syntax. Returns up to `limit` card objects with image URLs.' +
        ' Key filters: t:(type) c:(colors) id<=gruul (color identity fits within) cmc<=/>=N pow:/tou: r:(rarity) f:(format) o:(oracle text) keyword:(ability) is:commander otag:(ramp|removal|draw|tutor|boardwipe|counterspell).' +
        ' Examples: "t:creature id<=gruul f:commander" | "is:commander id:gruul" | "otag:ramp id<=temur f:commander" | "(t:instant OR t:sorcery) c:u o:counter cmc<=2"',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ query, limit }) => {
        const cards = await searchCards(query)
        return {
          total: cards.length,
          cards: cards.slice(0, limit).map(projectScryfallCard),
        }
      },
    }),

    list_printings: tool({
      description: 'List every printing of a card by oracle_id (call before set_card_printing).',
      inputSchema: z.object({ oracle_id: z.string() }),
      execute: async ({ oracle_id }) => {
        const printings = await getPrintingsByOracleId(oracle_id)
        return printings.map((p) => ({
          id: p.id,
          set: p.set,
          set_name: p.set_name,
          collector_number: p.collector_number,
          released_at: p.released_at,
          finishes: p.finishes,
        }))
      },
    }),

    get_deck: tool({
      description: 'Get this deck\'s metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        const deck = await deckService.getDeck(supabase, userId, deckId)
        return {
          id: deck.id,
          name: deck.name,
          format: deck.format,
          description: deck.description,
          commander_scryfall_ids: deck.commander_scryfall_ids,
          cover_image_scryfall_id: deck.cover_image_scryfall_id,
        }
      },
    }),

    get_decklist: tool({
      description: 'Get every card in this deck. Returns deck_card_ids, scryfall_ids, oracle_ids, quantity, finish, tags.',
      inputSchema: z.object({}),
      execute: async () => {
        const cards = await deckService.getDecklist(supabase, userId, deckId)
        return cards.map((c) => ({
          deck_card_id: c.id,
          name: c.name,
          quantity: c.quantity,
          scryfall_id: c.scryfall_id,
          oracle_id: c.oracle_id,
          printing_scryfall_id: c.printing_scryfall_id,
          finish: c.finish,
          tags: c.tags,
        }))
      },
    }),

    get_deck_stats: tool({
      description:
        'Full statistics for this deck (matches the deck editor Analytics tab and format hints): counts, USD sum,' +
        ' format violations for Commander/EDH (and empty hints for other formats), mana curve, probabilities, color balance.',
      inputSchema: z.object({}),
      execute: async () => {
        const deck = await deckService.getDeck(supabase, userId, deckId)
        const rows = await deckService.getDecklist(supabase, userId, deckId)
        return buildDeckStatsReport(deck, rows)
      },
    }),

    add_card: tool({
      description: 'Add a card to the deck. Auto-increments quantity if the card is already there.',
      inputSchema: z.object({
        scryfall_id: z.string(),
        name: z.string(),
        oracle_id: z.string().nullable().optional(),
        printing_scryfall_id: z.string().nullable().optional(),
        quantity: z.number().int().min(1).default(1),
        finish: z.enum(['nonfoil', 'foil', 'etched']).optional(),
      }),
      execute: async (input) => {
        const row = await deckService.addCard(supabase, userId, deckId, {
          scryfall_id: input.scryfall_id,
          name: input.name,
          oracle_id: input.oracle_id ?? null,
          printing_scryfall_id: input.printing_scryfall_id ?? null,
          quantity: input.quantity,
          finish: input.finish,
        })
        return { deck_card_id: row.id, name: row.name, quantity: row.quantity }
      },
    }),

    remove_card: tool({
      description: 'Remove a card entry from the deck (regardless of quantity).',
      inputSchema: z.object({ deck_card_id: z.string() }),
      execute: async ({ deck_card_id }) => {
        await deckService.removeCard(supabase, userId, deck_card_id)
        return { removed: deck_card_id }
      },
    }),

    set_card_quantity: tool({
      description: 'Set a card\'s quantity. 0 deletes the entry.',
      inputSchema: z.object({
        deck_card_id: z.string(),
        quantity: z.number().int().min(0),
      }),
      execute: async ({ deck_card_id, quantity }) => {
        const row = await deckService.setCardQuantity(supabase, userId, deck_card_id, quantity)
        return row ? { deck_card_id: row.id, quantity: row.quantity } : { removed: deck_card_id }
      },
    }),

    add_card_tag: tool({
      description: 'Add a tag to a card.',
      inputSchema: z.object({ deck_card_id: z.string(), tag: z.string().min(1) }),
      execute: async ({ deck_card_id, tag }) => {
        const row = await deckService.addCardTag(supabase, userId, deck_card_id, tag)
        return { deck_card_id: row.id, tags: row.tags }
      },
    }),

    remove_card_tag: tool({
      description: 'Remove a tag from a card.',
      inputSchema: z.object({ deck_card_id: z.string(), tag: z.string().min(1) }),
      execute: async ({ deck_card_id, tag }) => {
        const row = await deckService.removeCardTag(supabase, userId, deck_card_id, tag)
        return { deck_card_id: row.id, tags: row.tags }
      },
    }),

    set_card_tags: tool({
      description: 'Replace all tags on a card.',
      inputSchema: z.object({ deck_card_id: z.string(), tags: z.array(z.string()) }),
      execute: async ({ deck_card_id, tags }) => {
        const row = await deckService.setCardTags(supabase, userId, deck_card_id, tags)
        return { deck_card_id: row.id, tags: row.tags }
      },
    }),

    set_card_printing: tool({
      description: 'Override the printing on a card. null reverts to the default printing.',
      inputSchema: z.object({
        deck_card_id: z.string(),
        printing_scryfall_id: z.string().nullable(),
      }),
      execute: async ({ deck_card_id, printing_scryfall_id }) => {
        const row = await deckService.setCardPrinting(
          supabase,
          userId,
          deck_card_id,
          printing_scryfall_id
        )
        return { deck_card_id: row.id, printing_scryfall_id: row.printing_scryfall_id }
      },
    }),

    set_card_finish: tool({
      description: 'Set the finish (foil/etched/nonfoil) on a card.',
      inputSchema: z.object({
        deck_card_id: z.string(),
        finish: z.enum(['nonfoil', 'foil', 'etched']),
      }),
      execute: async ({ deck_card_id, finish }) => {
        const row = await deckService.setCardFinish(supabase, userId, deck_card_id, finish)
        return { deck_card_id: row.id, finish: row.finish }
      },
    }),

    set_commanders: tool({
      description: 'Set the commander scryfall_ids for this deck (max 2). Empty array clears.',
      inputSchema: z.object({
        deck_id: z.string(),
        scryfall_ids: z.array(z.string()).max(2),
      }),
      execute: async ({ deck_id, scryfall_ids }) => {
        enforceDeck(deck_id)
        const row = await deckService.setCommanders(supabase, userId, deck_id, scryfall_ids)
        return { commander_scryfall_ids: row.commander_scryfall_ids }
      },
    }),

    set_cover_image: tool({
      description: 'Set the deck cover image to a scryfall_id (or null to clear).',
      inputSchema: z.object({
        deck_id: z.string(),
        scryfall_id: z.string().nullable(),
      }),
      execute: async ({ deck_id, scryfall_id }) => {
        enforceDeck(deck_id)
        const row = await deckService.setCoverImage(supabase, userId, deck_id, scryfall_id)
        return { cover_image_scryfall_id: row.cover_image_scryfall_id }
      },
    }),

    get_primer: tool({
      description: "Get this deck's primer markdown.",
      inputSchema: z.object({}),
      execute: async () => {
        const deck = await deckService.getDeck(supabase, userId, deckId)
        return { primer_markdown: deck.primer_markdown }
      },
    }),

    set_primer: tool({
      description:
        'Write or replace this deck\'s primer. The primer is GitHub-Flavored Markdown (headings, bold, italic, lists, links).' +
        ' Embed a card image inline with {{card:<printing_scryfall_id>}} — use the `id` field from search_scryfall or list_printings results (a UUID), NOT the oracle_id.' +
        ' Links must point to idlebrew.app (other hosts are stripped by the renderer).' +
        ' Call get_decklist first if you need card names/ids to embed.' +
        ' Pass the complete markdown; this replaces the entire primer.',
      inputSchema: z.object({
        markdown: z.string(),
      }),
      execute: async ({ markdown }) => {
        const row = await deckService.setPrimer(supabase, userId, deckId, markdown)
        return { saved: true, length: row.primer_markdown.length }
      },
    }),

    patch_primer: tool({
      description:
        'Replace an exact passage in this deck\'s primer without rewriting the whole thing.' +
        ' old_string must match exactly one location in the current primer; include enough surrounding' +
        ' context (a sentence or heading) to make it unique. Errors if the string is not found or matches' +
        ' more than once. Call get_primer first to read the current text.',
      inputSchema: z.object({
        old_string: z.string().min(1).describe('Exact text to find and replace'),
        new_string: z.string().describe('Replacement text (may be empty to delete)'),
      }),
      execute: async ({ old_string, new_string }) => {
        const row = await deckService.patchPrimer(supabase, userId, deckId, old_string, new_string)
        return { saved: true, length: row.primer_markdown.length }
      },
    }),

    list_deck_branches: tool({
      description:
        'List named branches for this deck (default branch is `main`). Each branch has its own version timeline; edits apply to the branch selected in the editor.',
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await deckService.listDeckBranches(supabase, userId, deckId)
        return rows.map((b) => ({
          id: b.id,
          name: b.name,
          head_version_id: b.head_version_id,
        }))
      },
    }),

    create_deck_branch: tool({
      description:
        'Create a new branch from the tip of the current branch (Git-style fork). Does not switch branches; call switch_deck_branch to work on the new line.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Branch name (unique per deck, e.g. "combo-line")'),
      }),
      execute: async ({ name }) => {
        const row = await deckService.createDeckBranch(supabase, userId, deckId, name)
        return { id: row.id, name: row.name, head_version_id: row.head_version_id }
      },
    }),

    switch_deck_branch: tool({
      description:
        'Switch this deck\'s working copy to another branch by name (e.g. `main`). Loads that branch\'s latest snapshot into the live decklist.',
      inputSchema: z.object({
        branch_name: z.string().min(1).describe('Existing branch name for this deck'),
      }),
      execute: async ({ branch_name }) => {
        await deckService.switchDeckBranchByName(supabase, userId, deckId, branch_name)
        return { switched_to: branch_name }
      },
    }),

    merge_deck_branch: tool({
      description:
        'Merge another branch into the current branch by name. Uses a three-way merge; when both sides changed the same card row, `when_conflicted` picks the default (`ours` = current branch head, `theirs` = source branch). For finer control use the deck editor merge UI.',
      inputSchema: z.object({
        source_branch: z.string().min(1).describe('Branch name to merge into the current branch'),
        when_conflicted: z.enum(['ours', 'theirs']).default('ours'),
      }),
      execute: async ({ source_branch, when_conflicted }) => {
        const result = await deckService.mergeDeckBranchByName(
          supabase,
          userId,
          deckId,
          source_branch,
          when_conflicted
        )
        return { merged_from: source_branch, conflict_rows: result.conflictCount }
      },
    }),
  }
}

function projectScryfallCard(c: ScryfallCard) {
  return {
    id: c.id,
    oracle_id: c.oracle_id,
    name: c.name,
    type_line: c.type_line,
    mana_cost: c.mana_cost,
    cmc: c.cmc,
    colors: c.colors,
    color_identity: c.color_identity,
    set: c.set,
    set_name: c.set_name,
    collector_number: c.collector_number,
    image_url: c.image_uris?.normal ?? null,
  }
}
