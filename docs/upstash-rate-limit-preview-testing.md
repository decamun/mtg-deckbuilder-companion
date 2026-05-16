# Preview testing guide: Upstash Redis durable rate limits

This PR replaces the process-local `Map` rate limiting with **Upstash Redis**
so rate-limit counters are shared across all Vercel serverless instances. Use
the steps below to verify the feature on a Vercel preview deployment before
merging.

---

## 1. Create a free Upstash Redis database

1. Go to <https://console.upstash.com/> and sign in (or create a free account).
2. Click **Create Database** → choose a region close to your Vercel deployment
   region (e.g. `us-east-1`).
3. Keep the default **Regional** type and click **Create**.
4. Once created, open the database and copy two values from the **REST API**
   section:
   - **UPSTASH_REDIS_REST_URL** — looks like
     `https://<id>.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN** — a long bearer token

> The free tier is more than sufficient; rate-limit keys are tiny and
> short-lived (one counter per logical key per 60-second window).

---

## 2. Add env vars to the Vercel preview deployment

1. In the Vercel dashboard, go to your project → **Settings → Environment
   Variables**.
2. Add the following variables (scope: **Preview** is sufficient for testing):

   | Variable | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | paste from step 1 |
   | `UPSTASH_REDIS_REST_TOKEN` | paste from step 1 |
   | `DEBUG_RATE_LIMIT` | `1` *(optional, enables console logging on Redis errors)* |

3. Trigger a new preview deployment (push a commit or redeploy from the
   Vercel dashboard).

---

## 3. Verify Redis is being used

Open the Vercel deployment logs (or stream them with `vercel logs --follow`)
and make any request to the app. You should **not** see any Redis errors. If
`DEBUG_RATE_LIMIT=1` is set and Redis is misconfigured you would see:

```
[rate-limit] Redis error, failing open: ...
```

You can also confirm from Upstash: the **Data Browser** in the console should
start showing keys with the prefix `rate:fw:v1:` after the first rate-limited
endpoint is hit.

---

## 4. Smoke-test each rate-limited endpoint

### 4a. `/oauth/token` — 60 req/min per IP

```bash
# Replace PREVIEW_URL with your Vercel preview URL
PREVIEW_URL=https://<your-preview>.vercel.app

# Hit the token endpoint 3 times (expect 400 — missing params — NOT 429)
for i in 1 2 3; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$PREVIEW_URL/oauth/token" \
    -H "Content-Type: application/json" \
    -d '{}'
done
```

Expected: `400` each time (bad request, not rate-limited).

To trigger a 429 you would need 60 requests in under 60 seconds from the same
IP. You can do this with a loop:

```bash
for i in $(seq 1 65); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST "$PREVIEW_URL/oauth/token" \
    -H "Content-Type: application/json" \
    -d '{}'
done
```

After the 60th request you should see `429` responses. The response body will
contain `"error": "rate_limited"` and the response headers will include
`Retry-After`.

### 4b. `/oauth/register` — 30 req/min per IP

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST "$PREVIEW_URL/oauth/register" \
    -H "Content-Type: application/json" \
    -d '{"redirect_uris":["https://example.com/callback"],"client_name":"test"}'
done
```

Expected: first 30 succeed (`201`), subsequent requests return `429`.

### 4c. EDHREC proxy — 30 req/min per authenticated user

The EDHREC endpoint (`/api/edhrec/[slug]`) requires auth. Log in to the app
via the browser, then grab your session cookie or Bearer token from the browser
DevTools (Network tab → any API request → `Authorization` header or `Cookie`).

```bash
# With a Bearer token:
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -H "Authorization: Bearer <your-token>" \
    "$PREVIEW_URL/api/edhrec/commanders"
done
```

Expected: first 30 succeed (`200`), subsequent requests return `429`.

---

## 5. Verify cross-instance sharing (optional but recommended)

By default Vercel scales serverless functions across multiple instances. To
confirm rate limits are truly shared:

1. Make ~30 requests to `/oauth/token` from **two different browser tabs or
   tools** simultaneously (so they may land on different instances).
2. The combined counter should still enforce the 60-request limit — not 60 per
   instance.

> This is difficult to guarantee in a preview environment because load is low.
> A simpler check is to look at the Upstash Data Browser and confirm a
> **single** key `rate:fw:v1:oauth-token:<your-ip>` exists with a count that
> reflects all requests.

---

## 6. Test fail-open behavior (optional)

To verify that the app continues to work if Redis is unavailable:

1. Temporarily change `UPSTASH_REDIS_REST_TOKEN` to an invalid value in
   Vercel's env vars (e.g. append `_BAD`).
2. Redeploy and make requests to any rate-limited endpoint.
3. All requests should succeed (`200`/`400` as normal, not `500` or `429`).
4. If `DEBUG_RATE_LIMIT=1`, the Vercel logs should show:
   ```
   [rate-limit] Redis error, failing open: ...
   ```
5. Restore the correct token and redeploy when done.

---

## 7. Clean up

- After testing, you can remove `DEBUG_RATE_LIMIT=1` from the Vercel env vars.
- Keep `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the
  production deployment when this PR merges.
- The same Upstash database can be reused for production (free tier is fine).
