import { NextResponse } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import {
  getUserTier,
  TIER_LIMITS,
  checkQuota,
  recordCall,
  ALL_MODELS,
  DEFAULT_MODEL,
  type ModelId,
} from '@/lib/agent-quota'
import { resolveModel, reasoningProviderOptions } from '@/lib/agent-models'
import { buildDeckAgentTools } from '@/lib/agent-tools'
import {
  normalizeFormatForValidation,
  scryfallLegalityFilterForNormalizedFormat,
} from '@/lib/deck-format-validation'
import * as deckService from '@/lib/deck-service'
import { getCardsByIds, type ScryfallCard } from '@/lib/scryfall'
import { getRequestId } from '@/lib/request-id'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  deckId: string
  modelId?: ModelId
  enableReasoning?: boolean
}

function buildDeckContext(
  format: string | null,
  commanderCards: ScryfallCard[]
): string {
  const fmtDisplay = (format && format.trim()) || 'unspecified'
  const normalized = normalizeFormatForValidation(format)

  if (!normalized) {
    return `Format: ${fmtDisplay} (not set to a known rules bundle). Call get_deck for the stored format string, pick a matching Scryfall \`f:\` filter when one exists, and use get_deck_stats for any validation the app exposes.`
  }

  if (normalized === 'edh') {
    if (commanderCards.length === 0) {
      return `Format: ${fmtDisplay} (Commander/EDH). No commanders set — search with \`f:commander\` for legality; add \`id<=\` once commanders define color identity.`
    }

    const combinedIdentity = [
      ...new Set(commanderCards.flatMap(c => c.color_identity ?? [])),
    ]
      .sort()
      .join('')
      .toLowerCase() || 'c'

    const commanderLines = commanderCards
      .map(c => {
        const ci = (c.color_identity ?? []).join('').toLowerCase() || 'c'
        const text = c.oracle_text?.replace(/\n/g, ' ') ?? ''
        return `  - ${c.name} [${ci}] — ${text}`
      })
      .join('\n')

    return `Format: ${fmtDisplay} (Commander/EDH)
Commanders:
${commanderLines}
Combined color identity: ${combinedIdentity}

Default search behavior: always include \`id<=${combinedIdentity} f:commander\` unless the user explicitly asks for off-identity or off-format cards.
Card evaluation: when suggesting adds or cuts, assess synergy with the commander(s) above — prefer cards that advance or enable their strategies.`
  }

  if (normalized === 'canlander') {
    return `Format: ${fmtDisplay} (Canadian Highlander). Points and deck construction are validated in-app — after shortlisting cards with Scryfall, call get_deck_stats and read format_validation (Scryfall does not encode the points list).`
  }

  const fKey = scryfallLegalityFilterForNormalizedFormat(normalized)
  if (fKey) {
    return `Format: ${fmtDisplay}. When searching for cards to add, include \`f:${fKey}\` for format legality unless the user asks otherwise. Color-identity filters (\`id<=\`) are optional outside Commander.`
  }

  return `Format: ${fmtDisplay}. Use get_deck_stats for format_validation; this label has no dedicated Scryfall \`f:\` mapping here — rely on oracle/type searches and in-app validation.`
}

function scryfallFormatLegalitySection(normalized: string | null): string {
  if (normalized === 'edh') {
    return `**Format legality** — This deck is **Commander/EDH**. Always use \`f:commander\` when searching for format-legal cards.

**Examples**:
- Creatures that fit in a Gruul deck: \`t:creature id<=gruul f:commander\`
- Find Gruul commanders: \`is:commander id:gruul\`
- Green ramp spells (by oracle tag): \`otag:ramp id<=gruul f:commander\`
- Blue counterspells cmc≤2: \`t:instant c:u o:counter cmc<=2 f:commander\`
- Cheap white creatures: \`t:creature c:w cmc<=2 f:commander\`
- Artifact ramp under 3 mana: \`f:commander t:artifact o:mana cmc<=3\`
- Draw spells for Dimir: \`otag:draw id<=dimir f:commander\`
- Board wipes: \`otag:boardwipe f:commander\``
  }

  if (!normalized) {
    return `**Format legality** — \`f:\` supports commander, standard, modern, pioneer, legacy, vintage, pauper (among others). This deck has no normalized format in metadata — call \`get_deck\` first, then choose the \`f:\` token that matches that format.

**Examples** (swap \`f:\` to match the deck once known):
- Commander within Temur identity: \`f:commander id<=temur t:creature cmc<=4\`
- Modern curve creatures: \`f:modern t:creature cmc<=3\`
- Pioneer interaction: \`f:pioneer t:instant cmc<=2\``
  }

  if (normalized === 'canlander') {
    return `**Format legality** — Canadian Highlander uses a points list validated in-app (not in Scryfall). Shortlist with oracle/type searches, then call \`get_deck_stats\` and read \`format_validation\` for points and deck-size errors.

**Examples** (no points filter in Scryfall):
- One-mana cantrips: \`t:instant cmc=1 o:"draw a card"\`
- Efficient creatures: \`t:creature o:"enters the battlefield" cmc<=3\``
  }

  const fKey = scryfallLegalityFilterForNormalizedFormat(normalized)
  if (fKey) {
    return `**Format legality** — This deck uses **${fKey}** legality on Scryfall. Include \`f:${fKey}\` when searching for format-legal cards unless the user asks otherwise.

**Examples**:
- Curve creatures: \`f:${fKey} t:creature cmc<=3\`
- Removal suite: \`f:${fKey} (t:instant OR t:sorcery) o:destroy\`
- Rare beaters: \`f:${fKey} r>=rare t:creature\`
- Sideboard tech (check zone rules in-app): \`f:${fKey} t:artifact o:counter\``
  }

  return `**Format legality** — This deck's format has no single Scryfall \`f:\` mapping in this assistant. Use oracle/type/color filters, then call \`get_deck_stats\` for \`format_validation\`.

**Examples**:
- Typal synergy search: \`t:elf o:"enters the battlefield"\`
- Color pie slice: \`c:w t:creature cmc<=2\``
}

const SYSTEM_PROMPT = (
  deckName: string,
  deckId: string,
  terse: boolean,
  deckContext: string,
  deckFormat: string | null
) => {
  const normalized = normalizeFormatForValidation(deckFormat)
  return `
You are an MTG deck-building assistant operating on the deck "${deckName}" (id: ${deckId}).

## Working style

- Stay concise: short answers; lead with actions and outcomes, not long essays.
- Prefer tools (\`get_decklist\`, \`search_scryfall\`, \`list_printings\`, etc.) over guessing card text, counts, or legality. Call tools early rather than describing what you would check.
- After tools return data, give a brief summary—do not paste large JSON or restate every card row unless the user asks.

Use the provided tools to search Scryfall, inspect this deck's cards, and apply edits.
Prefer batch reasoning over many small steps: call get_decklist once, plan, then act.
Confirm destructive edits (removing >1 card, replacing commanders, large tag rewrites)
by summarising the planned change in plain text BEFORE calling the tool.
${terse ? '\nExtra terse mode: minimal narration; call tools directly without restating the plan in detail.' : ''}

## Deck card tags — keep names consistent

Tags power grouping and filtering in the deck UI. **Reuse one canonical label per strategy** so cards with the same role sort together. Avoid redundant near-synonyms (e.g. \`landfall\` vs \`extra land drop\`)—if both mean “lands matter / extra land plays,” pick **landfall** (or whichever single tag the deck already uses) and stick to it.

**Preferred tags** — default to these lowercase names unless the user specifies otherwise:
\`ramp\`, \`removal\`, \`draw\`, \`tutor\`, \`boardwipe\`, \`counterspell\`, \`wincon\`, \`graveyard\`, \`tokens\`, \`landfall\`

Before adding or renaming tags, call \`get_decklist\` and match wording already on the deck when possible.

## This Deck

${deckContext}

## Scryfall Search Syntax

**Colors** — \`c:\` filters card colors; \`id:\` / \`identity:\` filters color identity.
  Values: w u b r g m(multicolor) c(colorless). Operators: \`c:rg\`=contains R+G, \`c=rg\`=exactly RG, \`c>=rg\`=at least RG, \`c<=rg\`=subset of RG.
  For Commander: use \`id<=gruul\` to find cards that FIT WITHIN a color identity (most common use case).
  Guild shortcuts: azorius(wu) dimir(ub) rakdos(br) gruul(rg) selesnya(wg) orzhov(wb) izzet(ur) golgari(bg) boros(wr) simic(ug)
  Shard/wedge shortcuts: esper(wub) grixis(ubr) jund(brg) naya(wrg) bant(wug) abzan(wbg) mardu(wbr) sultai(ubg) temur(urg) jeskai(wur)

**Types** — \`t:\`: creature instant sorcery artifact enchantment planeswalker land legendary tribal
  Subtypes work too: t:dragon t:elf t:wizard t:vampire t:human t:zombie

**Mana value** — \`cmc:\` or \`mv:\`: \`cmc<=3\` \`mv=2\` \`cmc>=6\`

**Stats** — \`pow:\` power, \`tou:\` toughness, \`loy:\` loyalty: \`pow>=4\` \`tou<=2\`

**Rarity** — \`r:\`: common uncommon rare mythic. \`r>=uncommon\` = uncommon or better.

**Set** — \`s:\` or \`e:\`: \`s:khm\` \`e:bro\` (3-letter set codes)

${scryfallFormatLegalitySection(normalized)}

**Oracle text** — \`o:\`: \`o:flying\` \`o:"draw a card"\` \`o:"enters the battlefield"\` \`o:"sacrifice"\`

**Keywords** — \`keyword:\`: \`keyword:flying\` \`keyword:trample\` \`keyword:haste\` \`keyword:vigilance\`

**Special** — \`is:\`: \`is:commander\` (legendary creature or planeswalker that can be a commander), \`is:spell\` (non-land), \`is:permanent\`, \`is:historic\` (artifact/legendary/saga), \`is:vanilla\` (no text), \`is:reserved\`

**Oracle tags** — \`otag:\` / \`oracletag:\`: curated functional tags, great for Commander. \`otag:ramp\` \`otag:removal\` \`otag:draw\` \`otag:tutor\` \`otag:boardwipe\` \`otag:counterspell\`

**Booleans**: space = AND; \`OR\`; \`-\` or \`NOT\` to negate. Parentheses group terms.

## Primer Syntax

Primers are public-facing deck guides written in **GitHub-Flavored Markdown** (headings, bold, italic, bullet/numbered lists, tables, code blocks, blockquotes). Use \`get_primer\` to read the existing primer and \`set_primer\` to write or replace it.

**Card embeds** — render a card image inline:
\`\`\`
{{card:<printing_scryfall_id>}}
\`\`\`
- Use the \`id\` field returned by \`search_scryfall\` or \`list_printings\` — this is a printing-specific UUID (e.g. \`"a1b2c3d4-..."\`).
- Do NOT use \`oracle_id\` here; oracle ids are not accepted and will not render.
- Call \`get_decklist\` first when you need card ids already in the deck; call \`search_scryfall\` or \`list_printings\` when you need a specific printing.
- Card tokens can appear anywhere in the markdown text, including inside paragraphs or list items.

**Links** — only links to \`idlebrew.app\` are allowed. Other hosts are silently stripped by the renderer when the primer is displayed. Do not add links to external sites.

**Workflow for drafting a primer**:
1. Call \`get_deck\` for deck name, format, and commanders (if any).
2. Call \`get_decklist\` to see all cards and their ids.
3. Draft the full markdown, embedding card images with \`{{card:<id>}}\` using the \`scryfall_id\` values from the decklist (or use \`list_printings\` if a specific art/set is wanted).
4. Call \`set_primer\` with the complete markdown — this replaces the entire primer.

**Workflow for editing part of an existing primer**:
1. Call \`get_primer\` to read the current text.
2. Identify the exact passage to change.
3. Call \`patch_primer\` with \`old_string\` set to that passage (include enough surrounding context — a full sentence or heading — to make it unique) and \`new_string\` set to the replacement.
4. If the string matches multiple places, widen \`old_string\` until it is unique.
Use \`patch_primer\` for targeted edits; reserve \`set_primer\` for full rewrites.
`.trim()
}

export async function POST(request: Request) {
  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 })
  }
  if (!body?.deckId || !Array.isArray(body.messages)) {
    return NextResponse.json({ message: 'Missing deckId or messages' }, { status: 400 })
  }

  const modelId: ModelId = body.modelId ?? DEFAULT_MODEL
  if (!ALL_MODELS.includes(modelId)) {
    return NextResponse.json({ message: `Unknown model ${modelId}` }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const tierName = await getUserTier(supabase, user.id)
  const tier = TIER_LIMITS[tierName]

  if (!tier.allowedModels.includes(modelId)) {
    return NextResponse.json(
      {
        message: `${modelId} is not available on the ${tierName} tier.`,
        reason: 'tier_model',
        tier: tierName,
      },
      { status: 403 }
    )
  }

  const quota = await checkQuota(supabase, user.id, tier)
  if (!quota.ok) {
    return NextResponse.json(
      {
        message: 'Hourly call limit reached.',
        reason: 'rate_limit',
        callsThisHour: quota.callsThisHour,
        callsRemaining: 0,
        resetAt: quota.resetAt.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((quota.resetAt.getTime() - Date.now()) / 1000).toString(),
        },
      }
    )
  }

  // Pre-flight ownership check on the deck the agent is bound to.
  let deck
  try {
    deck = await deckService.getDeck(supabase, user.id, body.deckId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Deck not found'
    return NextResponse.json({ message: msg }, { status: 404 })
  }

  const requestId = getRequestId(request)
  const quotaLog = await recordCall(supabase, user.id, modelId)
  if (!quotaLog.ok) {
    logger.error('[agent-chat] quota logging failed (fail closed)', {
      userId: user.id,
      modelId,
      error: quotaLog.error,
      requestId,
    })
    return NextResponse.json(
      {
        message: 'Unable to record usage for this request. Please try again shortly.',
        requestId,
      },
      {
        status: 503,
        headers: {
          'Retry-After': '60',
          'x-request-id': requestId,
        },
      }
    )
  }

  const commanderCards = deck.commander_scryfall_ids.length > 0
    ? await getCardsByIds(deck.commander_scryfall_ids)
    : []

  const tools = buildDeckAgentTools(supabase, user.id, body.deckId, deck.format)
  const useTerseAssistantStyle =
    modelId === 'anthropic/claude-haiku-4.5' ||
    modelId === 'deepseek/deepseek-v4-flash'
  const deckContext = buildDeckContext(deck.format, commanderCards)

  const result = streamText({
    model: resolveModel(modelId),
    system: SYSTEM_PROMPT(deck.name, deck.id, useTerseAssistantStyle, deckContext, deck.format),
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(tier.maxStepsPerCall),
    providerOptions: reasoningProviderOptions(
      modelId,
      body.enableReasoning ?? !useTerseAssistantStyle
    ),
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  })
}
