# Agent pro test accounts

Agents can provision disposable Supabase test accounts with idlebrew pro for
manual verification of subscription-gated UI.

## Use the helper script

Create and confirm a disposable Supabase Auth user first. Then run:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run agent:pro-account -- --email cursor-<task>@example.com --yes
```

To remove the pro flag after testing:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run agent:pro-account -- --email cursor-<task>@example.com --disable --yes
```

## Safety rules

- The script only runs with `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to
  client code or `NEXT_PUBLIC_*` variables.
- Mutations require `--yes`.
- `--email` is required even when `--user-id` is supplied, so the target remains
  auditable in logs.
- By default, emails must start with `cursor`, `agent`, `test`, `e2e`, `qa`, or
  `ci`, and must use `example.com`, `test.com`, or `idlebrew.test`.
- For intentional one-off admin use only, set `ALLOW_NON_TEST_PRO_ACCOUNT=1` to
  bypass the disposable-email guard.

## What it changes

The helper upserts `public.user_account_flags` for the target auth user and sets
`idlebrew_pro_subscribed` to `true` or `false`. It does not create auth users,
confirm emails, or alter billing state.
