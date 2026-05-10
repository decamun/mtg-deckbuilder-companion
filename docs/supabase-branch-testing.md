# Supabase branch-aware testing for cloud agents

When the GitHub integration is enabled, Supabase automatically creates a **preview
database branch** for pull requests that change files under `supabase/` (for
example migrations, Edge Functions, `config.toml`, or `seed.sql`). That branch
gets its own isolated Postgres instance, API URL, and credentials.

Cloud agents should use that preview branch for **any work that needs a
writable backend, schema isolation, or the service role** (including
`provision-agent-pro-account.mjs`). Production is reachable with the
**publishable (anon) key** for client-only smoke tests, but the production
**service role key is not available** in Cursor Cloud secrets anymore—do not
assume you can mutate production data or bypass RLS from agent environments.

Vercel still creates a **preview deployment** for every PR. You can test in the
browser against that URL or against `localhost`; both are fine as long as the
`NEXT_PUBLIC_SUPABASE_*` variables point at the database you intend (preview
branch vs production).

---

## Preview branch limitations

Preview databases are **empty**: no production users, decks, or billing state.

**OAuth (Google, GitHub, etc.) is not expected to work** against a preview
branch: redirect URLs, provider configuration, and secrets are tied to the main
project. Use **email / password** auth for manual verification: `curl` signup
with the branch anon key, confirm the disposable user with SQL (see
`docs/WORKTREE_AGENTS.md`), then sign in through the app UI.

---

## When does a preview branch exist?

Supabase creates a branch for a PR when **all** of the following are true:

1. The GitHub integration is enabled on the project (it is).
2. The PR changes at least one file under `supabase/`.
3. The branch has finished provisioning (`status == ACTIVE_HEALTHY`).

If your work does **not** touch `supabase/` and you still need an isolated
database with a service role (for example subscription-tier setup via the
helper script), add a minimal legitimate change under `supabase/` in the same
PR or stack a short-lived PR that only exists to spawn a branch—**never** use
the production service role from cloud agents.

If there are no `supabase/` changes, use the **production** URL and publishable
key for anon-level testing only; see `docs/WORKTREE_AGENTS.md` and
`docs/agent-pro-test-accounts.md` for what is still possible without a service
role.

---

## Required secrets (Cursor Cloud)

| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | **Required** to read the preview branch **service_role** API key via the Supabase Management API (`/v1/projects/<branch-ref>/api-keys`). Without it, agents cannot run `provision-agent-pro-account.mjs` or other admin flows against a branch. |

The production `SUPABASE_SERVICE_ROLE_KEY` is **intentionally not** injected for
cloud agents. Retrieve a **per-branch** service role key with the token above;
do not substitute production’s key.

---

## Step-by-step agent workflow (PR with `supabase/` changes)

### 1. Discover the preview branch

Use the Supabase MCP `list_branches` tool with the production project id
`ejnnjdvgrwsjfgafxtvk`. Find the entry whose `git_branch` matches your git
branch name.

```
MCP: list_branches(project_id="ejnnjdvgrwsjfgafxtvk")
```

Read:

- `project_ref` — use as `project_id` for subsequent MCP calls targeting the branch
- `status` — must be `ACTIVE_HEALTHY` before proceeding

If there is no row yet, wait for the integration to create one after the PR is
opened.

### 2. Wait for `ACTIVE_HEALTHY`

Poll `list_branches` about every 15 seconds. If the branch is still not healthy
after roughly five minutes, treat it as an infrastructure issue (retry the
workflow or inspect Supabase/GitHub integration logs)—**do not** switch
schema-affecting tests to production to “unblock”.

### 3. Branch URL and publishable key

```
MCP: get_project_url(project_id="<branch-project-ref>")
MCP: get_publishable_keys(project_id="<branch-project-ref>")
```

Use these values for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(local `npm run dev`, `npm run build`, or when checking env on a Vercel preview).

### 4. Branch service_role key

```bash
curl -s \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/<branch-ref>/api-keys" \
  | jq -r '.[] | select(.name == "service_role") | .api_key'
```

Export it only for the duration of the helper script or admin task; never
commit it or place it in `NEXT_PUBLIC_*` variables.

If `SUPABASE_ACCESS_TOKEN` is missing in the environment, say so in your summary
and stop: you cannot complete admin provisioning on the branch without it.

### 5. Start the dev server (local) or use Vercel preview

**Local:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<branch-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<branch-anon-key> \
NEXT_PUBLIC_IDLEBREW_HOSTS=localhost:3000,127.0.0.1:3000,idlebrew.app,www.idlebrew.app,*.decamuns-projects.vercel.app \
npm run dev
```

**Vercel:** If the project links Supabase to Vercel, preview deployments may
already receive branch-scoped `NEXT_PUBLIC_SUPABASE_*` values. Otherwise, set
them in the Vercel dashboard for preview environments or rely on local dev
with the same values.

### 6. Provision test accounts on the branch

Preview branches start empty—always pass `--create`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<branch-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<branch-service-role-key> \
npm run agent:pro-account -- \
  --email cursor-<task>-pro@example.com \
  --create \
  --tier pro \
  --password '<strong-test-password>' \
  --yes
```

### 7. Point Supabase MCP operations at the branch

For `execute_sql`, `get_advisors`, `apply_migration`, etc., pass the **branch**
`project_ref` as `project_id`, not `ejnnjdvgrwsjfgafxtvk`.

### 8. Manual tests

Follow the deck editor smoke test in `docs/WORKTREE_AGENTS.md` using the branch
URL and anon key, with email/password auth (not OAuth).

---

## PRs without `supabase/` changes

No Supabase preview branch is created automatically. Use the **main** project
URL and publishable key for client-side smoke tests.

You **cannot** run `provision-agent-pro-account.mjs` against production from
Cursor Cloud (no production service role). Use signup + MCP SQL email
confirmation as in `docs/WORKTREE_AGENTS.md`, and accept that **subscription
tier manipulation** requires either a preview branch plus branch service role or
a maintainer running the helper locally with an explicit key.

---

## Enabling `SUPABASE_ACCESS_TOKEN`

1. Create a personal access token at
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
2. In Cursor: **Cloud Agents › Secrets** → add `SUPABASE_ACCESS_TOKEN`.

Scope should allow reading project API keys for the org that owns this Supabase
project.

---

## Quick reference

| Task | Target | Notes |
|------|--------|--------|
| Discover branch | Production project id | MCP `list_branches` |
| App URL / anon key | Branch `project_ref` | MCP `get_project_url`, `get_publishable_keys` |
| Service role key | Branch `project_ref` | Management API + `SUPABASE_ACCESS_TOKEN` |
| `npm run dev` | Branch or prod URL | Match URL to the DB you are testing |
| `provision-agent-pro-account` | **Branch only** in cloud | Needs branch service role |
| `execute_sql` / advisors | Branch ref when on a branch PR | Never use prod for branch-schema validation |
