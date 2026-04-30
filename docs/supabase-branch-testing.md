# Supabase branch-aware testing for cloud agents

When the GitHub integration is enabled, Supabase automatically creates a **preview
database branch** for every pull request that touches files under `supabase/`.
That branch gets its own isolated Postgres instance, API URL, and credentials.

Cloud agents should test against their PR's preview branch rather than the
shared production database. This page explains when that applies, how to
discover the branch, and what secrets you need.

---

## When does a preview branch exist?

Supabase creates a branch for a PR when **all three** conditions are true:

1. The GitHub integration is enabled on the project (it is).
2. The PR changes at least one file under `supabase/` (migrations, Edge
   Functions, `config.toml`, or `seed.sql`).
3. The branch has finished its provisioning workflow (status `ACTIVE_HEALTHY`).

If none of your changes touch `supabase/`, no preview branch is created and
you should continue to test against the main project as documented in
`docs/WORKTREE_AGENTS.md`.

---

## Required secrets

| Secret | Where to add | Purpose |
|--------|-------------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Cursor Cloud › Secrets | Already present; used for the **main** project |
| `SUPABASE_ACCESS_TOKEN` | Cursor Cloud › Secrets | **Needed to retrieve the preview branch's service_role key** via the Supabase Management API |

> **SUPABASE_ACCESS_TOKEN is the critical gap.** Without it, agents can
> discover the preview branch via the Supabase MCP but cannot retrieve its
> service_role key, which is required by `provision-agent-pro-account.mjs`
> and any direct database admin operations. See the [hooking it up](#hooking-it-up)
> section at the bottom.

---

## Step-by-step agent workflow

### 1. Determine whether a preview branch exists

Use the Supabase MCP `list_branches` tool with the production project ref
(`ejnnjdvgrwsjfgafxtvk`). Look for an entry whose `git_branch` field matches
your git branch name.

```
MCP: list_branches(project_id="ejnnjdvgrwsjfgafxtvk")
```

Match on `git_branch == <your-branch-name>` and read:

- `project_ref` — the branch's unique ref (use as `project_id` for all
  subsequent MCP calls)
- `status` — must be `ACTIVE_HEALTHY` before proceeding

If no matching entry is found, skip to the [no-branch path](#no-preview-branch).

### 2. Wait for the branch to be healthy

The branch's provisioning pipeline (clone → pull → health → configure →
migrate → seed → deploy) takes up to a few minutes after the PR is opened or
a commit is pushed.

Poll with `list_branches` at ~15-second intervals until `status` is
`ACTIVE_HEALTHY`. Give up after ~5 minutes and fall back to the main project
if it never becomes healthy.

### 3. Retrieve branch credentials

Use the Supabase MCP `get_project_url` and `get_publishable_keys` tools,
targeting the **branch's** `project_ref`:

```
MCP: get_project_url(project_id="<branch-project-ref>")
→ https://<branch-ref>.supabase.co

MCP: get_publishable_keys(project_id="<branch-project-ref>")
→ anon key / publishable key
```

For the **service_role key**, you must use the Supabase Management API
(requires `SUPABASE_ACCESS_TOKEN`):

```bash
curl -s \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/<branch-ref>/api-keys" \
  | jq -r '.[] | select(.name == "service_role") | .api_key'
```

### 4. Start the dev server against the branch

Replace the production URL and anon key with the branch values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<branch-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<branch-anon-key> \
NEXT_PUBLIC_IDLEBREW_HOSTS=localhost:3000,127.0.0.1:3000,idlebrew.app,www.idlebrew.app,*.decamuns-projects.vercel.app \
npm run dev
```

### 5. Provision test accounts against the branch

Pass the branch URL and its service_role key to the helper:

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

Preview branches start empty (no production data), so you must always pass
`--create` — existing production accounts do not exist in the branch.

### 6. Run all database operations against the branch

When using the Supabase MCP tools for SQL, schema queries, or advisor checks,
pass the **branch `project_id`**, not the production project ref:

```
MCP: execute_sql(project_id="<branch-ref>", query="...")
MCP: get_advisors(project_id="<branch-ref>", type="security")
```

### 7. Run manual tests as normal

Follow the deck editor smoke test from `docs/WORKTREE_AGENTS.md`, but use the
branch URL and credentials from steps 3–4.

---

## No-preview-branch path

If the PR has no `supabase/` changes (or the branch never becomes healthy),
use the main project as documented in `docs/WORKTREE_AGENTS.md`. The
production project ref is `ejnnjdvgrwsjfgafxtvk`.

---

## Hooking it up

Everything in this workflow works **except retrieving the branch service_role
key**, which requires `SUPABASE_ACCESS_TOKEN`. Without it, agents can still
run the dev server and browser tests using the anon/publishable key, but
`provision-agent-pro-account.mjs` and any direct admin DB operations will fail
unless you fall back to the production service_role key (acceptable for
non-schema-changing tasks, but not ideal).

**To fully enable this workflow, add one secret to Cursor Cloud:**

1. Generate a personal access token at
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
2. In Cursor, go to **Cloud Agents › Secrets** and add:
   `SUPABASE_ACCESS_TOKEN = <your-token>`

Once that secret is injected, agents can retrieve branch service_role keys
and the full workflow described above works end-to-end.

---

## Quick reference

| Task | Use branch? | Tool / command |
|------|-------------|----------------|
| Discover branch | — | MCP `list_branches` |
| Get branch URL | Yes | MCP `get_project_url(branch_ref)` |
| Get anon key | Yes | MCP `get_publishable_keys(branch_ref)` |
| Get service_role key | Yes | Management API (needs `SUPABASE_ACCESS_TOKEN`) |
| Start dev server | Yes | `NEXT_PUBLIC_SUPABASE_URL=<branch-url> npm run dev` |
| Provision test user | Yes | `provision-agent-pro-account.mjs` with branch URL + key |
| Schema SQL | Yes | MCP `execute_sql(project_id=branch_ref)` |
| Security advisors | Yes | MCP `get_advisors(project_id=branch_ref)` |
| Apply migration | Yes | MCP `apply_migration(project_id=branch_ref)` |
