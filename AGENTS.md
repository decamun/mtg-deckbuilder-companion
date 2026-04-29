<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development Workflow Rules

## Containerized Development
Run the app with Docker Compose instead of host `npm run dev`.

1. Copy `.env.example` to `.env` and fill in real secrets when needed.
2. Start the frontend with `docker compose up -d --build`.
3. Run project commands inside the container, for example `docker compose exec web npm run lint`, `docker compose exec web npx tsc --noEmit`, or `docker compose exec web npx shadcn add ...`.
4. Use host `npm` only for repository maintenance commands that wrap Docker Compose, such as `npm run agent:port`.

## Testing Backend Changes

End-to-end backend testing (migrations, API routes that hit the DB, etc.) is only possible when the agent is running inside a cloud container that has been provisioned with the full local backend — i.e. a Docker daemon + the local Supabase stack + the `supabase` CLI. Most agent sessions are **not** in such an environment.

Before assuming you can test backend changes, sanity-check the environment:
- `docker ps` succeeds (daemon is reachable)
- `supabase --version` resolves
- `curl -sf http://localhost:54321` reaches the local Supabase stack (Studio on 54323, app on 3000)

**If all three pass:** you're in a properly configured cloud container. Apply migrations with `supabase db push` (run on the host, not inside the container) and run all other commands via `docker compose exec web <cmd>`.

**If any of them fail:** you cannot exercise backend changes end-to-end. Write the code and migrations, verify with type-checks / unit tests / `next build` where possible, and explicitly call out anything that needs to be validated by a human (or a properly-provisioned agent) running the full Docker + Supabase stack.
