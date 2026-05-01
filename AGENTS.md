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

Use the Supabase MCP tools with project_id `ejnnjdvgrwsjfgafxtvk`:
- `get_project_url` → `https://ejnnjdvgrwsjfgafxtvk.supabase.co`
- `get_publishable_keys` → use the non-disabled publishable key (format
  `sb_publishable_...`)

### Gotchas

- The `npm run dev` script passes `--webpack` (Turbopack is not used).
- The app uses Next.js 16 `proxy` convention; a deprecation warning about
  `middleware` appears on startup but can be ignored.
- Deck page `/decks/[id]` redirects (307) when no auth cookie is set — this is
  expected; browser-based testing requires login via the UI.

## Supabase branch-aware testing

When a PR touches files under `supabase/`, the GitHub integration automatically
creates an isolated preview database branch. Agents **must** test against that
branch rather than the shared production database.

Full workflow: `docs/supabase-branch-testing.md`

Short version:
1. Call the Supabase MCP `list_branches` with project_id `ejnnjdvgrwsjfgafxtvk`
   and find the entry whose `git_branch` matches your branch name.
2. Wait for `status == ACTIVE_HEALTHY` (poll every ~15 s, give up after ~5 min).
3. Use `get_project_url` and `get_publishable_keys` with the branch's
   `project_ref` to get its URL and anon key.
4. Retrieve the branch service_role key via the Management API using
   `SUPABASE_ACCESS_TOKEN` (see `docs/supabase-branch-testing.md` for the curl
   command). If `SUPABASE_ACCESS_TOKEN` is not set, note this in your response
   and fall back to the production service_role key for non-schema tasks only.
5. Start the dev server and run all tests using the branch credentials.
6. Pass `--create` to `provision-agent-pro-account.mjs` — preview branches
   start empty, no production accounts carry over.

If the PR has no `supabase/` changes, skip to the standard hosted testing
instructions below.

## Hosted Supabase testing (no supabase/ changes)

Use the Supabase MCP tools to discover the active project, URL, and publishable
key when `.env` only points at local Supabase. For deck editor testing:

1. Create a disposable email/password user through Supabase Auth or the Auth
   REST signup endpoint.
2. If the hosted project requires email confirmation, confirm only that
   disposable user with SQL against `auth.users`.
3. Log into the app through the user menu, then navigate to `/decks`.
4. Create a deck and open `/decks/<id>` to exercise the editor.
5. Add a card through the editor search box to verify auth, RLS, Scryfall
   search, deck writes, and realtime/editor refresh behavior.

## Local Docker development

Docker Compose remains useful for local developer machines:

```bash
cp .env.example .env
docker compose up -d --build
```

If local Supabase is available, run `npx supabase start` and keep
`NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321` in `.env`.
