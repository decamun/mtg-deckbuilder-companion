# Social launch security — follow-ups (needs your input)

This complements [`social-launch-security-plan.md`](social-launch-security-plan.md). Automated/code fixes from the security sweep are merged separately; the items below **cannot be completed without owner action** (hosted dashboards, legal review, or manual QA).

---

## 1. Environment variables (production & previews)

### `NEXT_PUBLIC_SITE_URL`

OAuth callbacks now resolve redirects from **`NEXT_PUBLIC_SITE_URL` or `SITE_URL`** when set. If unset in production, redirects fall back to **`https://idlebrew.app`**.

**What you should do**

1. In **Vercel → Project → Settings → Environment Variables**, set  
   `NEXT_PUBLIC_SITE_URL=https://idlebrew.app` for **Production**.
2. For **Preview** deployments, either:
   - set `NEXT_PUBLIC_SITE_URL` to each preview URL (hard with branch previews), or  
   - rely on the canonical fallback only for production and accept that previews use `idlebrew.app` redirects after OAuth **unless** you set the variable per-preview (often impractical), or  
   - document that OAuth smoke tests run against production URL only.

If preview OAuth must land back on the preview host, you need a strategy (e.g. dynamic env per branch or testing OAuth only on production).

---

## 2. Supabase dashboard (hosted project)

These are **not** fully expressible in migrations or require Auth UI toggles.

### Leaked password protection

**Location:** Supabase Dashboard → **Authentication** → **Policies** (or **Providers** / security section depending on UI version) → enable **Leaked password protection** (HaveIBeenPwned-style checks).

### Re-run advisors after migrations

After the migration `20260510120000_social_launch_indexes_rls_and_advisor.sql` deploys:

1. Open **Database → Advisors** (Security + Performance).
2. Confirm no remaining **launch-blocking** Security Advisor issues.
3. Confirm Performance Advisor is clean for hot paths (indexes + RLS).

### `rls_auto_enable()`

The migration revokes execute on **`public.rls_auto_enable`** **if that function exists** in your database (some projects never had it). If Security Advisor still reports it after deploy, note the exact signature from the dashboard and adjust privileges in a follow-up migration.

---

## 3. Legal / compliance

### Counsel review

The security plan explicitly asked for **lawyer review before paid launch or major ad spend**. Terms now include a short **Paid plans and billing** placeholder; final **pricing, refund, tax, chargeback, and subscription** language should come from counsel.

### Stripe / billing (when you ship Pro)

When you integrate checkout:

- Link checkout terms to the finalized Terms section.
- Ensure Privacy Policy reflects payment processor sub-processing if applicable.

---

## 4. Operational testing & monitoring

### CSP / headers smoke test

Add a manual or Playwright check that:

- Login (Google/Facebook), deck editor, card images, Analytics/Speed Insights, and Turnstile still work under the enforced CSP.

### End-to-end negative tests

The plan called for automated tests that:

- User A’s MCP/API key cannot access user B’s decks (per tool).
- Invalid MCP keys are rate-limited (already partially enforced in code; tests would lock behavior).

These require a running server + Supabase (or preview branch) and are left for your **QA pipeline**.

### Abuse alerting

Plan items (invalid-key bursts, high write rates) imply **logging/metrics + alerts** (e.g. Vercel Observability, external APM). Implement when you choose a monitoring stack.

### Load testing

Social-launch flow load tests (sign-up, browse, editor, agent chat, MCP) need **k6, Artillery, or similar** against staging — not automated here.

---

## 5. Supply chain — remaining `npm audit` noise

`next-pwa` was removed to drop known Workbox audit noise. Remaining findings may include **Next.js bundled PostCSS** or other transitive deps.

**What you should do**

1. Run `npm audit --omit=dev` locally after upgrades.
2. Track **Next.js security releases** and bump when advisories apply.
3. Decide whether CI should **fail** on audit (currently CI runs audit with **`continue-on-error: true`** so merges are not blocked until you set a severity policy).

---

## 6. Merge & deploy checklist

1. Merge PR → GitHub integration applies migrations to production **via your existing Supabase deploy path** (do **not** `db push` prod manually against policy).
2. Set **`NEXT_PUBLIC_SITE_URL`** on Vercel (production).
3. Enable **leaked password protection** in Supabase Auth.
4. Re-run **Security + Performance** advisors.
5. Smoke-test OAuth and agent chat (including quota edge cases).

---

## Quick reference — what was fixed in code (no action needed)

- Agent chat **fails closed** if quota logging insert fails (`503` + `Retry-After`).
- OAuth callback uses **trusted site origin** (env + safe production default).
- `/api/keys` and `/api/agent/limits` return **`requestId`** + **`x-request-id`** header for support correlation.
- **`npm ci`** on Vercel; **`next-pwa` removed**; **CI workflow** + **Dependabot** added.
- Migration adds **indexes**, **RLS `(select auth.uid())` hardening** on core deck paths + OAuth tokens, and **revokes** `rls_auto_enable` when present.
