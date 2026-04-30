# Agent subscription test accounts

Agents can provision disposable Supabase test accounts as either `pro` or `free`
for manual verification of subscription-gated UI.

## Use the helper script

Create a confirmed pro test account:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run agent:pro-account -- \
  --email cursor-<task>-pro@example.com \
  --create \
  --tier pro \
  --password '<strong-test-password>' \
  --yes
```

Create a confirmed non-pro test account:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run agent:pro-account -- \
  --email cursor-<task>-free@example.com \
  --create \
  --tier free \
  --password '<strong-test-password>' \
  --yes
```

To change an existing disposable account's tier:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run agent:pro-account -- --email cursor-<task>@example.com --tier pro --yes
npm run agent:pro-account -- --email cursor-<task>@example.com --tier free --yes
```

## Safety rules

- The script only runs with `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to
  client code or `NEXT_PUBLIC_*` variables.
- Mutations require `--yes`.
- `--email` is required even when `--user-id` is supplied, so the target remains
  auditable in logs.
- Account creation requires `--create` and a password of at least 12 characters.
- By default, emails must start with `cursor`, `agent`, `test`, `e2e`, `qa`, or
  `ci`, and must use `example.com`, `test.com`, or `idlebrew.test`.
- For intentional one-off admin use only, set `ALLOW_NON_TEST_PRO_ACCOUNT=1` to
  bypass the disposable-email guard.

## What it changes

With `--create`, the helper creates a confirmed Supabase Auth user with
`user_metadata.created_by = "agent-pro-account-helper"`. It then upserts
`public.user_account_flags` for the target user and sets
`idlebrew_pro_subscribed` from `--tier`.

The helper does not alter billing state. It only prepares test accounts for
manual agent verification.
