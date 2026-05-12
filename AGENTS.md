<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development Workflow Rules

## Cursor Cloud specific instructions

Host-based development is supported in Cursor Cloud. Do not require nested
Docker unless a task specifically needs the local Supabase stack or Docker-only
behavior.

Avoid creating video demo artifacts for feature work unless the user explicitly
asks for one or you determine a video is necessary to verify functionality.
Prefer lower-cost evidence such as automated test output, logs, or screenshots
when they are sufficient.

### Pull requests and follow-up work

- **Same feature, same PR:** If a pull request already exists for a feature the
  user requested, treat later messages as updates to that same effort unless the
  user clearly starts a new topic. Iterations, refinements, and scope tweaks for
  that feature stay on the **existing branch** and update the **existing pull
  request**. Do not open additional pull requests for follow-on work on the same
  feature unless the user explicitly asks to split the work.
- **Unrelated bugs — new branch and PR:** If testing reveals a problem that is
  **not** part of the same feature (for example, a pre-existing defect or a bug
  in unrelated code), fix it on a **fresh branch** with its **own pull request**
  so it can merge independently. Avoid mixing unrelated bug fixes into the
  feature branch when the fix should stand alone.

1. Install dependencies on the host with `npm ci` if `node_modules` is missing
   or incomplete.
2. Start the frontend with hosted Supabase settings:
   `NEXT_PUBLIC_SUPABASE_URL=<url> NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key> npm run dev`.
3. Open `http://localhost:3000/brew` for manual testing.
4. If older Docker runs left root-owned artifacts, fix ownership before host
   commands: `sudo chown -R ubuntu:ubuntu node_modules .next`.

### Node.js version

The project targets Node 24 (see `Dockerfile`). The update script installs it
via nvm. After nvm is loaded (`source $NVM_DIR/nvm.sh`), `node` and `npm` are
available globally.

### Quick verification commands

- **Lint:** `npm run lint`
- **Type check:** `npx tsc --noEmit`
- **Build:** `NEXT_PUBLIC_SUPABASE_URL=<url> NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> npm run build`
- **Dev server:** `NEXT_PUBLIC_SUPABASE_URL=<url> NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> npm run dev`

### Supabase MCP discovery

Use the Supabase MCP tools with project_id `ejnnjdvgrwsjfgafxtvk` when talking to
the **main** project (for example listing branches or anon-only prod smoke
tests):
- `get_project_url` → `https://ejnnjdvgrwsjfgafxtvk.supabase.co`
- `get_publishable_keys` → use the non-disabled publishable key (format
  `sb_publishable_...`)

**Credentials policy:** Cursor Cloud agents **do not** receive the production
`SUPABASE_SERVICE_ROLE_KEY`. Anything that needs admin Auth, RLS bypass, or the
`provision-agent-pro-account` helper must run against a **Supabase preview
branch**, using that branch’s service role key from the Management API (requires
`SUPABASE_ACCESS_TOKEN` in secrets). See `docs/supabase-branch-testing.md`.

**GitHub + Supabase:** When a PR changes files under `supabase/`, Supabase opens
an isolated preview database for that PR. **OAuth providers do not work** on
that database, and it has **no production user data**—use email/password flows
and `--create` when provisioning test accounts.

### Gotchas

- The `npm run dev` script passes `--webpack` (Turbopack is not used).
- The app uses Next.js 16 `proxy` convention; a deprecation warning about
  `middleware` appears on startup but can be ignored.
- Deck page `/decks/[id]` redirects (307) when no auth cookie is set — this is
  expected; browser-based testing requires login via the UI.

## Supabase migration rules

**Never run `supabase db push` against the prod project.** Migrations reach
prod only via the GitHub integration's deploy job after a PR merges to `main`.
If you need to validate SQL, push to a Supabase preview branch instead (the
integration creates one when the PR changes `supabase/`; see "Supabase
branch-aware testing" below).

**Migration filename convention.** New files must be named
`YYYYMMDDHHMMSS_<snake_case_name>.sql` where the `HHMMSS` suffix is one of:

- `0000XX` — midnight UTC plus a small ordinal, for ordering siblings on the
  same day (e.g. `20260605000001`, `20260605000002`).
- `HHMM00` — a hand-picked HH:MM with seconds zero (e.g. `20260605185000`).

Anything else (e.g. `081650`, `173847`) looks like a wall-clock auto-stamp from
`supabase migration new` and is rejected by
`.github/workflows/check-migration-filenames.yml`. The convention exists because
auto-stamps recorded directly to prod by cloud agents were the cause of a
`schema_migrations` drift incident; canonical filenames keep the local repo
and `schema_migrations` in lock-step.

After running `supabase migration new`, rename the file to fit the convention
before committing.

## Supabase branch-aware testing

When a PR touches files under `supabase/`, the GitHub integration automatically
creates an isolated preview database branch. Agents **must** use that branch for
schema work, admin scripts, and any test that would have used the production
service role.

Full workflow: `docs/supabase-branch-testing.md`

Short version:
1. Call the Supabase MCP `list_branches` with project_id `ejnnjdvgrwsjfgafxtvk`
   and find the entry whose `git_branch` matches your branch name.
2. Wait for `status == ACTIVE_HEALTHY` (poll every ~15 s, give up after ~5 min).
3. Use `get_project_url` and `get_publishable_keys` with the branch's
   `project_ref` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Retrieve the **branch** `service_role` key via the Management API using
   `SUPABASE_ACCESS_TOKEN` (see `docs/supabase-branch-testing.md`). If the token
   is missing, you cannot complete admin provisioning on the branch—state that
   clearly; **never** use or ask for the production service role from cloud
   agents.
5. Run `npm run dev` locally with those env vars, **or** use the Vercel preview
   URL if it is already wired to the same Supabase branch.
6. Pass `--create` to `provision-agent-pro-account.mjs` — preview branches start
   empty; use email/password login (OAuth is not supported on branches).

If the PR has no `supabase/` changes, skip to the hosted testing section below
(anon-only production; no `provision-agent-pro-account` against prod in cloud).

## Hosted Supabase testing (no supabase/ changes)

Use the Supabase MCP tools for the main project URL and publishable key when
`.env` only points at local Supabase. This path uses **production** data
policies with the **anon** key only—cloud agents do **not** have production
`SUPABASE_SERVICE_ROLE_KEY`, so you cannot run `provision-agent-pro-account`
here; use the REST signup + MCP SQL confirmation flow in
`docs/WORKTREE_AGENTS.md` instead.

For deck editor testing:

1. Create a disposable email/password user through the Auth REST signup endpoint
   (see `docs/WORKTREE_AGENTS.md`).
2. If email confirmation is required, confirm only that disposable user with SQL
   against `auth.users` via the Supabase MCP `execute_sql` tool on the **main**
   project id.
3. Log into the app through the user menu, then navigate to `/decks`.
4. Create a deck and open `/decks/<id>` to exercise the editor.
5. Add a card through the editor search box to verify auth, RLS, Scryfall
   search, deck writes, and realtime/editor refresh behavior.

If you need an isolated database or subscription-tier setup from an agent,
include a legitimate `supabase/` change in the PR so a preview branch is created,
then follow `docs/supabase-branch-testing.md`.

## Local Docker development

Docker Compose remains useful for local developer machines:

```bash
cp .env.example .env
docker compose up -d --build
```

If local Supabase is available, run `npx supabase start` and keep
`NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321` in `.env`.
