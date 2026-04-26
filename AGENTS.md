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

## Active Work

**Branch `claude/mcp-api-integration-Z77S6`** has an implementation plan in progress.  
Read **`docs/mcp-api-integration-plan.md`** before starting any work on MCP, API keys, or the `src/lib/mcp*.ts` / `src/app/api/` area.

This branch is designed to run in the **custom Docker + Supabase cloud environment**, which provides:
- Docker daemon + `docker compose` (full containerization as normal)
- Local Supabase stack on port 54321 (Studio on 54323)
- Next.js app on port 3000
- `supabase` CLI pre-installed for running `supabase db push`

In that environment, apply migrations with `supabase db push` (not inside the container) and execute all other commands via `docker compose exec web <cmd>` as usual.
