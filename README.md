# idlebrew

Next.js 16 app for AI-assisted Magic: The Gathering deck brewing.

## Development

Use host Node in Cursor Cloud and Docker Compose for local development.

### 1. Create `.env`

Copy the example file, then fill any private keys you need:

```bash
cp .env.example .env
```

The checked-in defaults point at local Supabase. Authenticated database flows need either a running local Supabase stack or a hosted Supabase project. Agent chat also needs `VERCEL_AI_GATEWAY_KEY` or `AI_GATEWAY_API_KEY`.

### 2. Cursor Cloud: start the app against hosted Supabase

Cloud agents can run the frontend directly on the host. Use the MCP Supabase tools to list projects and fetch the project URL plus a non-disabled publishable key, then start Next.js with those values:

```bash
npm ci
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key> \
npm run dev
```

Open http://localhost:3000/brew.

For authenticated deck editor testing, create a disposable email/password user against that Supabase project. If the project requires email confirmation, confirm only that disposable user via SQL:

```sql
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = '<agent-test-email>';
```

Then log in through the app, create a deck from `/decks`, open `/decks/<id>`, and exercise editor actions such as searching for and adding `Sol Ring`.

### 3. Local development: start with Docker Compose

```bash
docker compose up -d --build
```

Open http://localhost:3000/brew.

### 4. Optional: start local Supabase

If Docker supports the local Supabase stack in your environment:

```bash
npx supabase start
docker compose up -d --build
```

Then copy the service role key from `npx supabase status` into `.env` as `SUPABASE_SERVICE_ROLE_KEY`.

In constrained cloud VMs, the frontend can still run without Supabase; database-backed routes will fail until Supabase is available.

## Common commands

```bash
docker compose exec web npm run lint
docker compose exec web npx tsc --noEmit
docker compose exec web npm run build
docker compose down
```

## Worktrees and agents

Use the alternate compose file when a second checkout needs its own frontend port:

```bash
npm run agent:up
npm run agent:port
npm run agent:down
```
