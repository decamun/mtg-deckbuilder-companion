<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development Workflow Rules

## Cursor Cloud specific instructions

Host-based development is supported in Cursor Cloud. Do not require nested
Docker unless a task specifically needs the local Supabase stack or Docker-only
behavior.

1. Install dependencies on the host with `npm ci` if `node_modules` is missing
   or incomplete.
2. Start the frontend with hosted Supabase settings:
   `NEXT_PUBLIC_SUPABASE_URL=<url> NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key> npm run dev`.
3. Open `http://localhost:3000/brew` for manual testing.
4. If older Docker runs left root-owned artifacts, fix ownership before host
   commands: `sudo chown -R ubuntu:ubuntu node_modules .next`.

## Hosted Supabase testing

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
