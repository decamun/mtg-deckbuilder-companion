# Social launch security plan

This plan tracks the security and compliance work to complete before driving
high-volume social traffic to idlebrew.

## Scope

- Fix every P0 launch blocker from the April 30, 2026 review.
- Fix every P1 item except the publishable Supabase key concern.
- Keep public-by-default decks as intended product behavior. The only deck
  visibility change in this plan is clearer privacy disclosure.

## Supabase publishable keys

Supabase publishable keys are intended to be present in browser code and
developer docs. They identify the project and authorize requests as the public
client role; they are not equivalent to `SUPABASE_SERVICE_ROLE_KEY` and do not
grant admin access by themselves.

The security boundary is therefore:

1. Never expose service-role, secret, OAuth client secret, AI Gateway, or
   Management API tokens.
2. Treat publishable keys as public identifiers.
3. Enforce all data access through RLS, route-level authorization, rate limits,
   and Supabase Auth settings.
4. Rotate publishable keys only if abuse, project migration, or operational
   hygiene requires it.

## P0 remediation plan

### 1. Agent quota enforcement

Problem: `recordCall()` writes to `agent_call_log` with the user-scoped server
client, but `agent_call_log` only has a SELECT policy. Insert failures are
logged and ignored, so hourly limits can fail open.

Plan:

1. Add a migration with one of these two approaches:
   - Preferred: add a narrow authenticated INSERT policy:
     `WITH CHECK ((select auth.uid()) = user_id)`.
   - Alternative: add a server-only metering helper that uses the service-role
     client and validates `user.id === user_id` before insert.
2. Add a check constraint for known model IDs or a server-side validation guard
   immediately before insert.
3. Change `recordCall()` to return a success/failure result instead of
   swallowing insert errors.
4. In `/api/agent/chat`, fail closed with `503` or `429` if quota logging
   fails after quota validation.
5. Add tests:
   - Authenticated user can insert only their own quota row.
   - User cannot insert a row for another `user_id`.
   - A failed quota insert prevents the model request from starting.
   - Calls past the hourly limit return `429` with `Retry-After`.
6. Verify against the Supabase preview branch with Security Advisor and a real
   chat call that increments `agent_call_log`.

Acceptance criteria:

- `agent_call_log` row count increases by one for each successful agent call.
- The limits endpoint reflects the new call count.
- Direct PostgREST attempts to write another user's quota row fail.

### 2. EDHREC proxy abuse control

Problem: `/api/edhrec/[slug]` is public, accepts arbitrary slugs, and performs
server-side fetches to EDHREC without app-level throttling.

Plan:

1. Require a valid Supabase session for the route unless there is a specific
   public sharing use case.
2. Validate `slug` before outbound fetch:
   - lowercase letters, numbers, and hyphens only;
   - length cap, for example 1-120 characters;
   - reject path separators, encoded separators, dots, query-like input, and
     whitespace.
3. Add response caching:
   - use route-level cache headers for successful commander responses;
   - cache 404/empty results for a short duration;
   - keep upstream timeout.
4. Add rate limiting:
   - per user for signed-in requests;
   - per IP for unauthenticated fallback if any remains;
   - return `429` with a clear retry window.
5. Reduce log payloads so unexpected EDHREC response bodies are not printed in
   full.
6. Add tests:
   - unauthenticated request is rejected if auth is required;
   - invalid slug returns `400` without calling EDHREC;
   - valid slug still returns a normalized decklist;
   - rate limit returns `429`.
7. Document EDHREC as a third-party data dependency in the privacy policy.

Acceptance criteria:

- Invalid slugs never produce outbound EDHREC requests.
- Bulk unauthenticated requests cannot consume unbounded server egress.
- Legitimate brew flows still fetch commander averages.

### 3. MCP service-role blast radius

Problem: MCP API-key requests resolve to a service-role Supabase client. The
current deck-service helpers manually filter by `user_id`, but future tools can
accidentally bypass tenant isolation.

Plan:

1. Inventory every MCP tool in `src/lib/mcp.ts` and every helper it calls.
2. Add a mandatory helper boundary:
   - MCP tools must call user-scoped service functions only;
   - no tool may receive a raw service-role Supabase client directly.
3. Prefer one of these architecture changes:
   - dedicated Postgres RPCs that accept the authenticated API-key owner and
     enforce ownership in SQL;
   - short-lived user-scoped JWT/session impersonation for API-key requests;
   - a restricted database role for MCP that cannot read or write outside
     approved tables and functions.
4. Add per-key controls:
   - rate limit by API-key ID and user ID;
   - persist `last_used_at`, request count, failure count, and last coarse IP
     hash;
   - add key disable/rotate UX.
5. Add abuse detection:
   - alert on invalid-key bursts;
   - alert on high write rates or repeated tool errors;
   - return generic unauthorized responses without revealing whether a key
     exists.
6. Add tests:
   - API key for user A cannot read, mutate, or list user B decks.
   - Each MCP tool has a cross-tenant negative test.
   - Invalid key attempts are rate limited and logged.
7. Update Terms to describe automated/API use limits.

Acceptance criteria:

- Cross-tenant MCP tests fail closed for every tool.
- No exported MCP tool can call arbitrary Supabase tables without an ownership
  guard.
- A leaked MCP key can be disabled without affecting other keys.

### 4. Browser security headers and CSP

Problem: the app has no global Content-Security-Policy or baseline security
headers in `next.config.ts` or `vercel.json`.

Plan:

1. Add headers through `next.config.ts` so they are reviewed in code.
2. Start with these baseline headers:
   - `Strict-Transport-Security`;
   - `X-Content-Type-Options: nosniff`;
   - `Referrer-Policy: strict-origin-when-cross-origin`;
   - `Permissions-Policy` denying unused browser capabilities;
   - `frame-ancestors 'none'` through CSP.
3. Build a CSP allowlist from actual app dependencies:
   - `self`;
   - Supabase project URL for auth/data;
   - Vercel Analytics and Speed Insights endpoints;
   - Scryfall image/card data hosts used by the UI;
   - EDHREC only if direct browser access exists;
   - OAuth flow requirements for Google/Facebook sign-in;
   - Next.js development allowances only in development.
4. Roll out CSP in report-only mode first if production telemetry is available.
5. Fix violations, then enforce CSP.
6. Add tests:
   - `curl -I` or Playwright request verifies all headers on `/brew`,
     `/privacy`, `/decks`, and API routes as appropriate;
   - browser smoke test confirms login, deck editor, primer rendering,
     analytics, and card images still work.

Acceptance criteria:

- Security headers are present in production responses.
- No required app flow is broken by CSP.
- Inline script/style allowances are minimized and documented.

### 5. Public deck visibility disclosure

Decision: public-by-default decks are intended product behavior for sharing and
hosting, matching customer expectations and competitor norms.

Plan:

1. Do not change the database default.
2. Note in the privacy policy that decks are public by default and may include
   deck names, descriptions, card lists, primers, and version/history content.
3. Ensure UI copy near deck settings continues to make visibility clear.

Acceptance criteria:

- Privacy policy clearly states public-by-default deck behavior.
- No migration changes the default public sharing model.

## P1 remediation plan

### 1. OAuth callback redirect origin

Problem: `/auth/callback` builds redirects from the incoming request origin.

Plan:

1. Add a required production `NEXT_PUBLIC_SITE_URL` or server-only `SITE_URL`.
2. Build callback redirects with `new URL('/brew', trustedBaseUrl)`.
3. Keep local development support through an explicit allowlist.
4. Return a safe relative or trusted absolute URL for error redirects.
5. Add tests:
   - forged Host header cannot redirect off-domain;
   - valid callback still lands on `/brew`;
   - failed callback lands on the trusted error URL.

### 2. Privacy and Terms completeness

Problem: legal pages do not yet describe AI processing, EDHREC, MCP/API keys,
analytics, optional paid tiers, billing terms, or automation limits.

Plan:

1. Privacy page:
   - disclose AI-assisted features and Vercel AI Gateway/model provider
     processing;
   - disclose EDHREC recommendations;
   - disclose Vercel Analytics and Speed Insights;
   - disclose MCP/API-key access and key metadata;
   - disclose public-by-default deck hosting and sharing;
   - describe data retention for deck versions and API-key audit metadata.
2. Terms page:
   - add optional paid tier language before Pro launch;
   - add billing, refund, cancellation, and subscription-change language;
   - add automation/API use restrictions;
   - add enforcement rights for abuse, scraping, quota bypass, and key sharing.
3. Have counsel review before paid launch or major ad spend.

### 3. Generic API error responses

Problem: some API routes return raw database error messages.

Plan:

1. Replace client-facing `error.message` responses with generic messages.
2. Log detailed errors server-side with route name, user ID when available, and
   a generated request ID.
3. Return request IDs to clients for support.
4. Add tests for `/api/keys` and `/api/keys/[id]` failures.

### 4. Dependency and build supply chain

Problem: `npm audit --omit=dev` reports high-severity findings through
`next-pwa`/Workbox and moderate findings through Next's bundled PostCSS.

Plan:

1. Decide whether PWA support is required for launch.
2. If not required, remove `next-pwa` and generated service-worker behavior.
3. If required, replace `next-pwa` with a maintained Next 16-compatible PWA
   approach.
4. Track Next.js security advisories and upgrade when a patched release is
   available for the PostCSS advisory range.
5. Change Vercel install from `npm install` to `npm ci`.
6. Add Dependabot or Renovate for npm and GitHub Actions.
7. Add CI checks:
   - `npm ci`;
   - `npm run lint`;
   - `npm run build`;
   - `npm audit --omit=dev` with an explicit severity policy.

### 5. Supabase advisor findings

Problem: hosted Security Advisor reported:

- `public.rls_auto_enable()` is executable by anon/authenticated as a
  `SECURITY DEFINER` function.
- `public.revert_deck_to_version()` has mutable `search_path`.
- leaked password protection is disabled.

Plan:

1. Revoke public execute on `public.rls_auto_enable()` or move it out of the
   exposed schema if it is still needed.
2. Add `SET search_path = public` or a tighter schema list to
   `revert_deck_to_version()`.
3. Enable leaked password protection in hosted Supabase Auth.
4. Re-run Supabase Security Advisor and commit any schema changes as migrations.

### 6. Supabase performance readiness

Problem: hosted Performance Advisor reported missing foreign-key indexes and
RLS `auth.uid()` init-plan warnings.

Plan:

1. Add indexes for:
   - `decks.user_id`;
   - `deck_cards.deck_id`;
   - `deck_versions.parent_id`;
   - `deck_versions.created_by`.
2. Rewrite RLS policies to use `(select auth.uid())` where appropriate.
3. Re-run Performance Advisor and inspect query plans for deck list/editor
   queries.
4. Load-test common social-launch flows: sign-up, login, browse public deck,
   create deck, add cards, agent chat, and MCP key validation.

## Verification checklist

- `npm run lint`
- `npm run build`
- `npm audit --omit=dev`
- Supabase Security Advisor: no unresolved launch-blocking warnings.
- Supabase Performance Advisor: no missing indexes on hot relationships.
- Browser smoke test for `/brew`, `/privacy`, `/decks`, login, deck editor,
  agent chat, public deck sharing, and MCP key creation/deletion.
- Negative tests for cross-tenant deck access through browser, PostgREST, MCP,
  and realtime subscriptions.
