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
import * as deckService from '@/lib/deck-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  deckId: string
  modelId?: ModelId
  enableReasoning?: boolean
}

const SYSTEM_PROMPT = (deckName: string, deckId: string, terse: boolean) => `
You are an MTG deck-building assistant operating on the deck "${deckName}" (id: ${deckId}).

Use the provided tools to search Scryfall, inspect this deck's cards, and apply edits.
Prefer batch reasoning over many small steps: call get_decklist once, plan, then act.
Confirm destructive edits (removing >1 card, replacing commanders, large tag rewrites)
by summarising the planned change in plain text BEFORE calling the tool.
${terse ? '\nBe concise. Call tools directly without restating the plan in detail.' : ''}
`.trim()

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

  // Quota gate passed — record the call now so concurrent requests can't slip in.
  await recordCall(supabase, user.id, modelId)

  const tools = buildDeckAgentTools(supabase, user.id, body.deckId)
  const isHaiku = modelId === 'anthropic/claude-haiku-4.5'

  const result = streamText({
    model: resolveModel(modelId),
    system: SYSTEM_PROMPT(deck.name, deck.id, isHaiku),
    messages: convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(tier.maxStepsPerCall),
    providerOptions: reasoningProviderOptions(modelId, body.enableReasoning ?? !isHaiku),
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  })
}
