-- Account-level feature flags for the staged idlebrew pro rollout.
--
-- `idlebrew_pro_subscribed` gates agent-tier behavior and must only be changed
-- by trusted server/admin paths. Users can read their own flags and record
-- notify interest, but RLS prevents them from granting subscribed mode.

CREATE TABLE public.user_account_flags (
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idlebrew_pro_subscribed   boolean     NOT NULL DEFAULT false,
  idlebrew_pro_notify_me    boolean     NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_account_flags_pkey PRIMARY KEY (user_id)
);

CREATE INDEX user_account_flags_notify_me_idx
  ON public.user_account_flags (idlebrew_pro_notify_me)
  WHERE idlebrew_pro_notify_me;

ALTER TABLE public.user_account_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own account flags" ON public.user_account_flags
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users create own non-pro account flags" ON public.user_account_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND idlebrew_pro_subscribed = false
  );

CREATE POLICY "Users update own non-pro notification flag" ON public.user_account_flags
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND idlebrew_pro_subscribed = false
  )
  WITH CHECK (
    (select auth.uid()) = user_id
    AND idlebrew_pro_subscribed = false
  );

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_account_flags_set_updated_at
  BEFORE UPDATE ON public.user_account_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
