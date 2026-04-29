# idlebrew

Next.js 16 app for AI-assisted Magic: The Gathering deck brewing.

## Development

Use Docker Compose for local development. Do not run `npm run dev` directly on the host.

### 1. Create `.env`

Copy the example file, then fill any private keys you need:

```bash
cp .env.example .env
```

The checked-in defaults are enough to boot the frontend against the local Supabase URL. Authenticated database flows need a running Supabase stack. Agent chat also needs `VERCEL_AI_GATEWAY_KEY` or `AI_GATEWAY_API_KEY`.

### 2. Start the app

```bash
docker compose up -d --build
```

Open http://localhost:3000/brew.

### 3. Optional: start local Supabase

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
