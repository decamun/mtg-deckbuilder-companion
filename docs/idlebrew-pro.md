# idlebrew pro

`idlebrew pro` is the planned paid subscription for idlebrew.

## Planned benefits

- No ads.
- Higher usage limits for the brewing agent.
- Smarter models for the brewing agent.

## Current implementation

The current implementation is a staged rollout placeholder:

- Clicking locked Pro controls in the deck assistant opens a "Feature coming soon." prompt.
- The prompt's "Notify me" button sets `user_account_flags.idlebrew_pro_notify_me` for the signed-in account.
- `user_account_flags.idlebrew_pro_subscribed` is the account-level flag for subscribed mode.
- When `idlebrew_pro_subscribed` is true, the agent tier resolves to `pro` and all models in the model dropdown are enabled.

## Database flags

`public.user_account_flags` stores one row per Supabase auth user:

| Column | Purpose |
| --- | --- |
| `user_id` | Primary key and `auth.users` reference. |
| `idlebrew_pro_subscribed` | Enables subscribed mode. This should only be changed by trusted billing/admin paths. |
| `idlebrew_pro_notify_me` | Records interest from the current "Notify me" prompt. |

RLS lets users read their own flags and set notification interest, but prevents users from setting `idlebrew_pro_subscribed` themselves.

## Follow-up work

- Add real checkout and billing webhooks.
- Move subscription changes through a trusted server/admin path that sets `idlebrew_pro_subscribed`.
- Expand subscribed mode beyond model access as product behavior is defined.

## Agent test accounts

Agents that need to test free and subscribed modes should use the secure
provisioning flow in [agent-pro-test-accounts.md](agent-pro-test-accounts.md).
Do not set `idlebrew_pro_subscribed` on real user accounts for testing.
