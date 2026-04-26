#!/bin/bash
# Session-start hook for Claude Code web (cloud) sessions.
#
# Behaviour depends on what's available in the environment:
#
# A) Custom Docker+Supabase environment (recommended):
#    The environment's setup script already started Docker, Supabase, and
#    docker-compose before Claude Code launched. This hook just exports the
#    service_role key and reports the live endpoints.
#
# B) Standard cloud session (no Docker daemon):
#    Falls back to: npm install, optional Supabase CLI install (for remote
#    project migrations), and running Next.js directly on port 3000.
#    Requires these env vars in Claude Code settings for Supabase access:
#      NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
#      NEXT_PUBLIC_SUPABASE_ANON_KEY  — Supabase anon key
#      SUPABASE_SERVICE_ROLE_KEY      — Supabase service role key
#      SUPABASE_PROJECT_REF           — short ref (for `supabase db push`)
#      SUPABASE_DB_PASSWORD           — DB password (for `supabase db push`)

set -euo pipefail

# Only run in remote (cloud) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ── Path A: Docker is available (custom environment) ─────────────────────────
if docker info &>/dev/null 2>&1; then
  echo "[session-start] Docker available — custom environment detected."

  # Export service_role key if Supabase is running
  if supabase status &>/dev/null 2>&1; then
    SERVICE_ROLE_KEY=$(supabase status 2>/dev/null | grep 'service_role key' | awk '{print $NF}')
    [ -n "$SERVICE_ROLE_KEY" ] && \
      echo "export SUPABASE_SERVICE_ROLE_KEY='$SERVICE_ROLE_KEY'" >> "$CLAUDE_ENV_FILE"
  fi

  echo "[session-start] App:          http://localhost:3000"
  echo "[session-start] Supabase API: http://localhost:54321"
  echo "[session-start] Studio:       http://localhost:54323"
  exit 0
fi

# ── Path B: No Docker — standard cloud session ────────────────────────────────
echo "[session-start] No Docker daemon — using direct Node.js mode."

echo "[session-start] Installing npm dependencies..."
npm install

# Install Supabase CLI for remote project migration management
if ! command -v supabase &>/dev/null; then
  echo "[session-start] Installing Supabase CLI..."
  npm install -g supabase --silent
fi

# Persist supabase CLI on PATH for the session
echo "export PATH=\"\$(npm root -g)/../bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

# Link to remote Supabase project if credentials are configured
if [ -n "${SUPABASE_PROJECT_REF:-}" ] && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "[session-start] Linking Supabase CLI to remote project ${SUPABASE_PROJECT_REF}..."
  supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" || true
fi

# Start Next.js dev server directly (Docker unavailable — exception to
# containerization rule; only applies in this cloud environment)
if ! curl -sf http://localhost:3000 &>/dev/null; then
  echo "[session-start] Starting Next.js dev server on port 3000..."
  NODE_ENV=development nohup npm run dev -- --port 3000 > /tmp/nextjs-dev.log 2>&1 &
  for i in $(seq 1 30); do
    curl -sf http://localhost:3000 &>/dev/null && break
    sleep 2
  done
fi

echo "[session-start] App: http://localhost:3000"
echo "[session-start] Note: Supabase is remote — configure env vars in Claude Code settings."
