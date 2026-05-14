-- Allow logging deck-assistant calls for DeepSeek V4 Flash (free-tier model).

ALTER TABLE public.agent_call_log
  DROP CONSTRAINT IF EXISTS agent_call_log_model_check;

ALTER TABLE public.agent_call_log
  ADD CONSTRAINT agent_call_log_model_check
  CHECK (
    model IN (
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-opus-4.7',
      'deepseek/deepseek-v4-flash',
      'google/gemini-2.5-pro',
      'openai/gpt-5.1-thinking'
    )
  );
