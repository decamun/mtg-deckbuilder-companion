<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development Workflow Rules

## Containerization Requirement
**CRITICAL RULE:** All development on this project MUST be containerized. 
1. Always use Docker and `docker-compose`. 
2. Do not run `npm run dev` or other node scripts directly on the host machine. Instead, use `docker-compose up` or execute commands inside the container.
3. If you need to run specific tools (like adding a Shadcn UI component), do it by prefixing with the appropriate docker-compose command, e.g., `docker-compose exec web npx shadcn add ...`.

## Testing Backend Changes

End-to-end backend testing (migrations, API routes that hit the DB, etc.) is only possible when the agent is running inside a cloud container that has been provisioned with the full local backend — i.e. a Docker daemon + the local Supabase stack + the `supabase` CLI. Most agent sessions are **not** in such an environment.

Before assuming you can test backend changes, sanity-check the environment:
- `docker ps` succeeds (daemon is reachable)
- `supabase --version` resolves
- `curl -sf http://localhost:54321` reaches the local Supabase stack (Studio on 54323, app on 3000)

**If all three pass:** you're in a properly configured cloud container. Apply migrations with `supabase db push` (run on the host, not inside the container) and run all other commands via `docker compose exec web <cmd>`.

**If any of them fail:** you cannot exercise backend changes end-to-end. Write the code and migrations, verify with type-checks / unit tests / `next build` where possible, and explicitly call out anything that needs to be validated by a human (or a properly-provisioned agent) running the full Docker + Supabase stack.
