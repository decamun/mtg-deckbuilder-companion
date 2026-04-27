-- Sliding-window quota counter for the in-app deck-editor agent.
--
-- Each successful agent invocation inserts one row. The /api/agent/chat
-- handler counts rows in the last hour to enforce per-tier limits.

CREATE TABLE public.agent_call_log (
  id          uuid         NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  called_at   timestamptz  NOT NULL DEFAULT now(),
  model       text         NOT NULL,
  CONSTRAINT  agent_call_log_pkey PRIMARY KEY (id)
);

CREATE INDEX agent_call_log_user_called_at_idx
  ON public.agent_call_log (user_id, called_at DESC);

ALTER TABLE public.agent_call_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own log (for "calls remaining this hour" UI).
-- Inserts go through the server route handler with the service-role client,
-- so no INSERT policy is needed for clients.
CREATE POLICY "Users read own agent log" ON public.agent_call_log
  FOR SELECT USING (auth.uid() = user_id);
