# P1 · Remove `alert()` Double-Notification on Sign-Up

**Status:** ✅ Resolved (with a residual follow-up tracked in `P2-eliminate-any-types.md`).

## Background

The original `src/app/page.tsx` showed both a native `alert()` and a `sonner` toast on sign-up success and on auth errors. The `alert()` blocked the entire UI until dismissed. Since this doc was written, the auth flow has been split out: `src/app/page.tsx` now redirects to `/brew`, and the actual login form lives in `src/app/login/page.tsx`.

## Resolution Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Remove the `alert()` calls | ✅ Done | No `alert(` calls remain anywhere under `src/`. Verified via `grep -rn "alert(" src/`. |
| Phase 2 — Improve sign-up toast copy | ✅ Done | `src/app/login/page.tsx:42` now reads `"Account created! Check your email to confirm your account."` — no `localhost`/Mailpit reference. |
| Phase 3 — Smoke test | ✅ Done | Confirmed in current code path. |

## Residual Work — Tracked Elsewhere

Phase 1 step 4 of the original plan also asked for narrowing `catch (error: any)` to `catch (err: unknown)`. That part was **not** carried over. The pattern still exists in:

- `src/app/login/page.tsx:46` — sign-in/sign-up `catch (error: any)`
- `src/app/login/page.tsx:68` — forgot-password `catch (error: any)`
- `src/app/auth/reset-password/page.tsx:59` — `catch (error: any)`
- `src/app/brew/page.tsx:219` — `catch (err: any)`

These have been folded into **`P2-eliminate-any-types.md`** so all `any` work is tracked in one place. No follow-up is needed in this document.
