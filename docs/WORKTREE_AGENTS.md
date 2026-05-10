# Cloud Agent Testing

The old local-worktree Docker workflow is no longer required for Cursor Cloud
agents. Prefer the host Node process plus hosted Supabase for browser testing.

> **If your PR modifies any file under `supabase/`**, a Supabase preview branch
> is created automatically. Target that branch for the app and for any admin
> scripts (`provision-agent-pro-account`, etc.). Preview branches have **no
> production users** and **OAuth sign-in is not expected to work**—use
> email/password. See `docs/supabase-branch-testing.md` for discovery, env vars,
> and how to fetch the branch `service_role` key with `SUPABASE_ACCESS_TOKEN`.
>
> The instructions below focus on **production** testing with the publishable
> key when the PR does not touch `supabase/`. Cursor Cloud agents no longer have
> the production `SUPABASE_SERVICE_ROLE_KEY`; use REST signup + MCP SQL
> confirmation instead of the provisioning helper when testing prod from cloud.

## Start the frontend

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ejnnjdvgrwsjfgafxtvk.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_1WW8BDIyp7s1yDUKTKH95A_RFq_DqWf \
NEXT_PUBLIC_IDLEBREW_HOSTS=localhost:3000,127.0.0.1:3000,idlebrew.app,www.idlebrew.app,*.decamuns-projects.vercel.app \
npm run dev
```

Open `http://localhost:3000/brew`.

If dependencies or build output were created by an older container workflow,
fix ownership once before installing or starting:

```bash
sudo chown -R ubuntu:ubuntu node_modules .next
npm ci
```

## Login and deck editor smoke test

When testing against the **production project**, use the URL and publishable
key below (or the values from the Supabase MCP). When testing against a **preview
branch**, substitute the branch URL and anon key from the MCP and expect OAuth
to fail—use the same REST signup flow with the branch anon key.

1. Create a disposable auth user:

```bash
SUPABASE_URL="https://ejnnjdvgrwsjfgafxtvk.supabase.co"   # or branch URL
ANON_KEY="sb_publishable_1WW8BDIyp7s1yDUKTKH95A_RFq_DqWf"  # or branch anon key
EMAIL="cursor-agent-$(date +%Y%m%d%H%M%S)@example.com"
PASSWORD="CursorDeckTest123!"
curl -sS -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

2. Confirm the disposable user through the Supabase MCP SQL tool (use the
   branch `project_id` when on a preview branch):

```sql
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = '<EMAIL>';
```

3. In the browser, open the user menu, choose **Log In**, and sign in with that
   email and password.
4. Navigate to **Your Decks**, create an EDH deck, open the editor, search for
   `Sol Ring`, and click the search result to add it.
5. The editor is working when the new deck route loads and `Sol Ring` appears in
   the card list.
