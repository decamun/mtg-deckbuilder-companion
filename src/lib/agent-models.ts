import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { ModelId } from './agent-quota'

export interface ModelDescriptor {
  id: ModelId
  label: string
  /** Provider name shown in the UI. */
  provider: 'anthropic' | 'google' | 'openai'
  /** Whether this model supports a "thinking" / reasoning budget. */
  reasoning: boolean
}

export const MODEL_DESCRIPTORS: Record<ModelId, ModelDescriptor> = {
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    reasoning: false,
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    reasoning: true,
  },
  'claude-opus-4-7': {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    reasoning: true,
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    reasoning: true,
  },
  'gpt-5.1': {
    id: 'gpt-5.1',
    label: 'GPT-5.1',
    provider: 'openai',
    reasoning: true,
  },
}

export function resolveModel(modelId: ModelId): LanguageModel {
  const desc = MODEL_DESCRIPTORS[modelId]
  if (!desc) throw new Error(`Unknown model: ${modelId}`)
  switch (desc.provider) {
    case 'anthropic':
      return anthropic(desc.id)
    case 'google':
      return google(desc.id)
    case 'openai':
      return openai(desc.id)
  }
}

/**
 * Build provider-specific options for reasoning. Exposed as one record because
 * `streamText` accepts `providerOptions` keyed by provider id and dispatches.
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
  }
}
