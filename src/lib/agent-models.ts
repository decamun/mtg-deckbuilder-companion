import { createGatewayProvider } from '@ai-sdk/gateway'
import type { LanguageModel } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { ModelId } from './agent-quota'

export interface ModelDescriptor {
  id: ModelId
  label: string
  /** Underlying provider key — used to namespace `providerOptions`. */
  provider: 'anthropic' | 'deepseek' | 'google' | 'openai'
  /** Whether this model supports a "thinking" / reasoning budget. */
  reasoning: boolean
}

export const MODEL_DESCRIPTORS: Record<ModelId, ModelDescriptor> = {
  'use-mcp': {
    id: 'use-mcp',
    label: 'Use MCP',
    provider: 'anthropic',
    reasoning: false,
  },
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    reasoning: false,
  },
  'deepseek/deepseek-v4-flash': {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    reasoning: false,
  },
  'anthropic/claude-sonnet-4.6': {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    reasoning: true,
  },
  'anthropic/claude-opus-4.7': {
    id: 'anthropic/claude-opus-4.7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    reasoning: true,
  },
  'google/gemini-2.5-pro': {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    reasoning: true,
  },
  'openai/gpt-5.1-thinking': {
    id: 'openai/gpt-5.1-thinking',
    label: 'GPT-5.1 (thinking)',
    provider: 'openai',
    reasoning: true,
  },
}

/**
 * Lazy gateway singleton. The gateway routes to whichever upstream provider
 * the model id names, billed against a single Vercel AI Gateway key.
 *
 * The SDK reads `AI_GATEWAY_API_KEY` from env by default; we accept either
 * that or `VERCEL_AI_GATEWAY_KEY` so deployments using the historical name
 * keep working without a rename.
 */
let _gateway: ReturnType<typeof createGatewayProvider> | null = null
function getGateway() {
  if (!_gateway) {
    const apiKey =
      process.env.VERCEL_AI_GATEWAY_KEY ?? process.env.AI_GATEWAY_API_KEY
    if (!apiKey) {
      throw new Error(
        'VERCEL_AI_GATEWAY_KEY (or AI_GATEWAY_API_KEY) is not set. ' +
          'Add it to .env / docker-compose.yml so the agent route can call the gateway.'
      )
    }
    _gateway = createGatewayProvider({ apiKey })
  }
  return _gateway
}

export function resolveModel(modelId: ModelId): LanguageModel {
  return getGateway()(modelId)
}

/**
 * Build provider-specific options for reasoning. The gateway forwards these
 * verbatim, keyed by underlying provider name.
 */
export function reasoningProviderOptions(
  modelId: ModelId,
  enableReasoning: boolean,
  budgetTokens = 8000
): ProviderOptions {
  const desc = MODEL_DESCRIPTORS[modelId]
  if (!desc.reasoning || !enableReasoning) return {}
  switch (desc.provider) {
    case 'anthropic':
      return { anthropic: { thinking: { type: 'enabled', budgetTokens } } }
    case 'google':
      return {
        google: {
          thinkingConfig: { thinkingBudget: budgetTokens, includeThoughts: true },
        },
      }
    case 'openai':
      return { openai: { reasoningEffort: 'medium' } }
    case 'deepseek':
      return {}
  }
}
