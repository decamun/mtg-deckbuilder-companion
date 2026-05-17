import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpContext } from './mcp-context'
import { buildDeckStatsReport } from './deck-stats'
import { searchCards, getPrintingsByOracleId, type ScryfallCard } from './scryfall'

/** Shown to MCP clients so assistants align with in-app agent behavior (concision, tools-first, tag conventions). */
const MCP_ASSISTANT_INSTRUCTIONS = `
You are the idlebrew deck-building assistant. Always prefer tools over guessing—call get_deck, get_decklist, get_deck_stats, search_scryfall, list_printings, and other registered tools rather than assuming cards, counts, or format legality.

Keep replies concise; summarize tool outcomes briefly. Do not paste large JSON decks unless the user asks.

Deck card tags must stay consistent so filters group cards correctly. Avoid interchangeable synonyms for the same role (for example, pick landfall—not separate tags like "extra land drop"—for land-matter / extra-land packages unless the user dictates otherwise).

Preferred lowercase tags: ramp, removal, draw, tutor, boardwipe, counterspell, wincon, graveyard, tokens, landfall. Before adding tags, read existing tags via get_decklist and reuse wording already on the deck when possible.
`.trim()

/**
 * Build an MCP server bound to a specific authenticated user.
 *
 * Tools receive only a user-scoped context. That keeps service-role clients
 * behind deck-service helpers that apply explicit user_id ownership checks.
 */
export function createMcpServer(context: McpContext) {
  const { deckService: decks } = context
  const server = new McpServer(
    {
      name: 'idlebrew-MTG-Agent',
      version: '2.0.0',
    },
    { instructions: MCP_ASSISTANT_INSTRUCTIONS }
  )

  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
  const err = (text: string) => ({
    content: [{ type: 'text' as const, text }],
    isError: true,
  })
  const errFromException = (prefix: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    return err(`${prefix}: ${msg}`)
  }
  const json = (label: string, payload: unknown) =>
    ok(`${label}\n${JSON.stringify(payload, null, 2)}`)

  // ─── Scryfall ─────────────────────────────────────────────────────────────

  server.tool(
    'search_scryfall',
    'Search Scryfall using their full search syntax. Returns structured card objects.' +
      ' Key filters: t:(type) c:(colors) id<=gruul (color identity fits within) cmc<=/>=N pow:/tou: r:(rarity) f:(format) o:(oracle text) keyword:(ability) is:commander otag:(ramp|removal|draw|tutor|boardwipe|counterspell).' +
      ' Match `f:` to the deck format from get_deck (e.g. f:commander for Commander/EDH, f:modern for Modern).' +
      ' Examples: "t:creature id<=gruul f:commander" | "is:commander id:gruul" | "f:modern t:creature cmc<=3" | "(t:instant OR t:sorcery) c:u o:counter cmc<=2"',
    {
      query: z.string().min(1).describe('Scryfall search syntax'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Maximum number of results to return (1-50)'),
    },
    async ({ query, limit }) => {
      try {
        const cards = await searchCards(query)
        const trimmed = cards.slice(0, limit).map(projectScryfallCard)
        return json(`Found ${cards.length} cards (showing ${trimmed.length}):`, trimmed)
      } catch (e) {
        return errFromException('Scryfall search failed', e)
      }
    }
  )

  server.tool(
    'list_printings',
    'List every printing of a card by oracle_id. Useful before calling set_card_printing.',
    {
      oracle_id: z.string().describe('Scryfall oracle_id (a UUID)'),
    },
    async ({ oracle_id }) => {
      try {
        const printings = await getPrintingsByOracleId(oracle_id)
        const trimmed = printings.map((p) => ({
          id: p.id,
          set: p.set,
          set_name: p.set_name,
          collector_number: p.collector_number,
          released_at: p.released_at,
          finishes: p.finishes,
        }))
        return json(`Found ${printings.length} printings:`, trimmed)
      } catch (e) {
        return errFromException('list_printings failed', e)
      }
    }
  )

  // ─── Decks ────────────────────────────────────────────────────────────────

  server.tool(
    'list_decks',
    'List the authenticated user\'s decks (id, name, format, created_at).',
    {},
    async () => {
      try {
        const rows = await decks.listDecks()
        const trimmed = rows.map((d) => ({
          id: d.id,
          name: d.name,
          format: d.format,
          created_at: d.created_at,
          is_public: d.is_public,
        }))
        return json(`You have ${rows.length} deck(s):`, trimmed)
      } catch (e) {
        return errFromException('list_decks failed', e)
      }
    }
  )

  server.tool(
    'get_deck',
    'Get deck metadata: name, format, description, commander Scryfall ids, cover image.',
    { deck_id: z.string().describe('UUID of the deck') },
    async ({ deck_id }) => {
      try {
        const deck = await decks.getDeck(deck_id)
        return json('Deck:', {
          id: deck.id,
          name: deck.name,
          format: deck.format,
          description: deck.description,
          is_public: deck.is_public,
          commander_scryfall_ids: deck.commander_scryfall_ids,
          cover_image_scryfall_id: deck.cover_image_scryfall_id,
        })
      } catch (e) {
        return errFromException('get_deck failed', e)
      }
    }
  )

  server.tool(
    'get_decklist',
    'Get every card in a deck with quantity, tags, finish, and printing info.',
    { deck_id: z.string().describe('UUID of the deck') },
    async ({ deck_id }) => {
      try {
        const cards = await decks.getDecklist(deck_id)
        const trimmed = cards.map((c) => ({
          deck_card_id: c.id,
          name: c.name,
          quantity: c.quantity,
          scryfall_id: c.scryfall_id,
          oracle_id: c.oracle_id,
          printing_scryfall_id: c.printing_scryfall_id,
          finish: c.finish,
          tags: c.tags,
          zone: c.zone,
        }))
        return json(
          `Decklist (${trimmed.reduce((s, c) => s + c.quantity, 0)} cards across ${trimmed.length} entries):`,
          trimmed
        )
      } catch (e) {
        return errFromException('get_decklist failed', e)
      }
    }
  )

  server.tool(
    'get_deck_stats',
    'Full deck statistics aligned with the deck editor: total/mainboard/commander counts, USD sum (when prices exist),' +
      ' analytics (avg CMC, type counts, lands breakdown, mana curve, opening probabilities, color balance),' +
      ' and format_validation for this deck\'s format (violations + deck_violations when validation is implemented — Commander/EDH, Standard, Modern, Pioneer, Legacy, Vintage, Pauper, Canadian Highlander; neutral or minimal messages otherwise).' +
      ' Same payload shape as the in-app editor; use format_validation.validation_implemented to see whether rules ran.',
    { deck_id: z.string().describe('UUID of the deck') },
    async ({ deck_id }) => {
      try {
        const deck = await decks.getDeck(deck_id)
        const rows = await decks.getDecklist(deck_id)
        const report = await buildDeckStatsReport(deck, rows)
        return json('Deck stats:', report)
      } catch (e) {
        return errFromException('get_deck_stats failed', e)
      }
    }
  )

  // ─── Mutations ────────────────────────────────────────────────────────────

  server.tool(
    'add_card',
    'Add a card to a deck. If the card is already in the deck, increments quantity.',
    {
      deck_id: z.string().describe('UUID of the deck'),
      scryfall_id: z.string().describe('Scryfall card id (UUID)'),
      name: z.string().describe('Card name'),
      oracle_id: z.string().nullable().optional().describe('Scryfall oracle_id'),
      printing_scryfall_id: z
        .string()
        .nullable()
        .optional()
        .describe('Specific printing override (null = default)'),
      quantity: z.number().int().min(1).default(1),
      finish: z.enum(['nonfoil', 'foil', 'etched']).optional(),
    },
    async ({ deck_id, scryfall_id, name, oracle_id, printing_scryfall_id, quantity, finish }) => {
      try {
        const row = await decks.addCard(deck_id, {
          scryfall_id,
          name,
          oracle_id: oracle_id ?? null,
          printing_scryfall_id: printing_scryfall_id ?? null,
          quantity,
          finish,
        })
        return ok(
          `Added ${quantity}× ${name} (deck_card_id=${row.id}, total quantity now ${row.quantity})`
        )
      } catch (e) {
        return errFromException('add_card failed', e)
      }
    }
  )

  server.tool(
    'remove_card',
    'Remove a card entry from a deck entirely (regardless of quantity). Use set_card_quantity to decrement.',
    {
      deck_card_id: z.string().describe('id of the deck_cards row (NOT the scryfall_id)'),
    },
    async ({ deck_card_id }) => {
      try {
        await decks.removeCard(deck_card_id)
        return ok(`Removed deck_card ${deck_card_id}`)
      } catch (e) {
        return errFromException('remove_card failed', e)
      }
    }
  )

  server.tool(
    'set_card_quantity',
    'Set a card\'s quantity. Setting to 0 deletes the entry.',
    {
      deck_card_id: z.string(),
      quantity: z.number().int().min(0),
    },
    async ({ deck_card_id, quantity }) => {
      try {
        const row = await decks.setCardQuantity(deck_card_id, quantity)
        if (!row) return ok(`Removed deck_card ${deck_card_id} (quantity set to 0)`)
        return ok(`Set ${row.name} quantity to ${row.quantity}`)
      } catch (e) {
        return errFromException('set_card_quantity failed', e)
      }
    }
  )

  server.tool(
    'add_card_tag',
    'Add a tag (e.g. "wincon", "ramp") to a deck card. Tags are free-text.',
    { deck_card_id: z.string(), tag: z.string().min(1) },
    async ({ deck_card_id, tag }) => {
      try {
        const row = await decks.addCardTag(deck_card_id, tag)
        return ok(`Tags on ${row.name}: ${row.tags.join(', ') || '(none)'}`)
      } catch (e) {
        return errFromException('add_card_tag failed', e)
      }
    }
  )

  server.tool(
    'remove_card_tag',
    'Remove a tag from a deck card.',
    { deck_card_id: z.string(), tag: z.string().min(1) },
    async ({ deck_card_id, tag }) => {
      try {
        const row = await decks.removeCardTag(deck_card_id, tag)
        return ok(`Tags on ${row.name}: ${row.tags.join(', ') || '(none)'}`)
      } catch (e) {
        return errFromException('remove_card_tag failed', e)
      }
    }
  )

  server.tool(
    'set_card_tags',
    'Replace all tags on a deck card.',
    { deck_card_id: z.string(), tags: z.array(z.string()) },
    async ({ deck_card_id, tags }) => {
      try {
        const row = await decks.setCardTags(deck_card_id, tags)
        return ok(`Tags on ${row.name}: ${row.tags.join(', ') || '(none)'}`)
      } catch (e) {
        return errFromException('set_card_tags failed', e)
      }
    }
  )

  server.tool(
    'set_card_printing',
    'Override the printing for a deck card. Pass null to revert to the default printing.',
    {
      deck_card_id: z.string(),
      printing_scryfall_id: z
        .string()
        .nullable()
        .describe('Scryfall id of the desired printing, or null to clear'),
    },
    async ({ deck_card_id, printing_scryfall_id }) => {
      try {
        const row = await decks.setCardPrinting(deck_card_id, printing_scryfall_id)
        return ok(
          `Printing for ${row.name} set to ${row.printing_scryfall_id ?? 'default'}`
        )
      } catch (e) {
        return errFromException('set_card_printing failed', e)
      }
    }
  )

  server.tool(
    'set_card_finish',
    'Set foil/etched/nonfoil on a deck card.',
    {
      deck_card_id: z.string(),
      finish: z.enum(['nonfoil', 'foil', 'etched']),
    },
    async ({ deck_card_id, finish }) => {
      try {
        const row = await decks.setCardFinish(deck_card_id, finish)
        return ok(`Finish for ${row.name} set to ${row.finish}`)
      } catch (e) {
        return errFromException('set_card_finish failed', e)
      }
    }
  )

  server.tool(
    'set_commanders',
    'Set up to 2 commander Scryfall ids on a deck. Pass an empty array to clear. Commander/EDH uses these for color-identity validation in get_deck_stats; for other formats they are optional metadata.',
    {
      deck_id: z.string(),
      scryfall_ids: z.array(z.string()).max(2),
    },
    async ({ deck_id, scryfall_ids }) => {
      try {
        const row = await decks.setCommanders(deck_id, scryfall_ids)
        return ok(`Commanders: [${row.commander_scryfall_ids.join(', ') || 'none'}]`)
      } catch (e) {
        return errFromException('set_commanders failed', e)
      }
    }
  )

  server.tool(
    'set_cover_image',
    'Set the deck cover image to a specific Scryfall card. Pass null to clear.',
    {
      deck_id: z.string(),
      scryfall_id: z.string().nullable(),
    },
    async ({ deck_id, scryfall_id }) => {
      try {
        const row = await decks.setCoverImage(deck_id, scryfall_id)
        return ok(`Cover image: ${row.cover_image_scryfall_id ?? 'cleared'}`)
      } catch (e) {
        return errFromException('set_cover_image failed', e)
      }
    }
  )

  // ─── Primer ───────────────────────────────────────────────────────────────

  server.tool(
    'get_primer',
    "Get a deck's primer (the full markdown guide text).",
    { deck_id: z.string().describe('UUID of the deck') },
    async ({ deck_id }) => {
      try {
        const deck = await decks.getDeck(deck_id)
        return ok(deck.primer_markdown || '(no primer)')
      } catch (e) {
        return errFromException('get_primer failed', e)
      }
    }
  )

  server.tool(
    'set_primer',
    'Write or replace a deck\'s primer. The primer is GitHub-Flavored Markdown (headings, bold, italic, lists, links).' +
      ' Embed a card image inline with {{card:<printing_scryfall_id>}} — use the `id` field from search_scryfall or list_printings results (a UUID), NOT the oracle_id.' +
      ' Links must point to idlebrew.app (other hosts are stripped by the renderer).' +
      ' Pass the complete markdown content; this replaces the entire primer.',
    {
      deck_id: z.string().describe('UUID of the deck'),
      markdown: z.string().describe('Full primer markdown content'),
    },
    async ({ deck_id, markdown }) => {
      try {
        const row = await decks.setPrimer(deck_id, markdown)
        return ok(`Primer saved (${row.primer_markdown.length} chars)`)
      } catch (e) {
        return errFromException('set_primer failed', e)
      }
    }
  )

  server.tool(
    'patch_primer',
    'Replace an exact passage in a deck\'s primer without rewriting the whole thing.' +
      ' old_string must match exactly one location in the current primer; include enough surrounding' +
      ' context (a sentence or heading) to make it unique. Errors if the string is not found or matches' +
      ' more than once. Call get_primer first to read the current text.',
    {
      deck_id: z.string().describe('UUID of the deck'),
      old_string: z.string().min(1).describe('Exact text to find and replace'),
      new_string: z.string().describe('Replacement text (may be empty to delete)'),
    },
    async ({ deck_id, old_string, new_string }) => {
      try {
        const row = await decks.patchPrimer(deck_id, old_string, new_string)
        return ok(`Primer patched (${row.primer_markdown.length} chars)`)
      } catch (e) {
        return errFromException('patch_primer failed', e)
      }
    }
  )

  return server
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
