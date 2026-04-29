# Cloud Agent Testing

The old local-worktree Docker workflow is no longer required for Cursor Cloud
agents. Prefer the host Node process plus hosted Supabase for browser testing.

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

1. Create a disposable auth user with the hosted Supabase anon key:

```bash
EMAIL="cursor-agent-$(date +%Y%m%d%H%M%S)@example.com"
PASSWORD="CursorDeckTest123!"
curl -sS -X POST "https://ejnnjdvgrwsjfgafxtvk.supabase.co/auth/v1/signup" \
  -H "apikey: sb_publishable_1WW8BDIyp7s1yDUKTKH95A_RFq_DqWf" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

2. Confirm the disposable user through the Supabase MCP SQL tool:

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
