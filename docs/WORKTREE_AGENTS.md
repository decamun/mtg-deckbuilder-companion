# Working in Git Worktrees

Use a separate frontend container per worktree so branches do not fight over
port 3000. The worktree service reads the same `.env` variables as the main
compose file, but maps container port 3000 to a random host port.

## Start a worktree frontend

```bash
npm run agent:up
npm run agent:port
```

Open the printed address, for example `http://localhost:32768`.

## Stop a worktree frontend

```bash
npm run agent:down
```

## Backend access

The worktree frontend points at `NEXT_PUBLIC_SUPABASE_URL` from `.env`. If that
is `http://host.docker.internal:54321`, start Supabase from whichever checkout
owns the local backend first:

```bash
npx supabase start
```

If the current VM cannot run Supabase, use a hosted Supabase project in `.env`
or restrict validation to pages and checks that do not require the database.
