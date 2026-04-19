# Working in Git Worktrees (For Agents)

This project uses a **Shared Backend, Alternate Frontend** strategy for local testing in git worktrees. This ensures that agents can test their changes without encountering port collisions or needing to spin up duplicate heavyweight database instances.

## How It Works

1. **Shared Database**: The main directory (`mtg-deckbuilder-companion`) hosts the Supabase stack. Any data created in the main directory is available in the worktrees, and vice versa.
2. **Alternate Frontend**: Worktrees spin up their own Next.js frontend container, but use an **ephemeral (random) port** so they don't clash with the main frontend on port `3000`.

## Instructions for Agents

When checked out in a worktree, **DO NOT** run `supabase start` or `docker-compose up`.

Instead, use the specialized agent scripts:

### 1. Start the Frontend
Run the following command to spin up the web container on a random port:
```bash
npm run agent:up
```
*Note: This automatically uses `docker-compose.agent.yml` which is configured to connect to the main directory's database via `host.docker.internal`.*

### 2. Find the Port
To find out which port your frontend was assigned, run:
```bash
npm run agent:port
```
This will output something like `0.0.0.0:32768`. You can now access your worktree's frontend at `http://localhost:32768`.

### 3. Stop the Frontend
When you are done testing, tear down the container:
```bash
npm run agent:down
```

## Troubleshooting

- **Database Connection Refused**: Ensure that the main directory is currently running `supabase start`. The worktree frontend relies on the main directory's database being available.
- **Port Command Fails**: Ensure `npm run agent:up` has finished successfully before trying to get the port.
