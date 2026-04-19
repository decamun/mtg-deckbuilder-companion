# P1 · Remove `alert()` Double-Notification on Sign-Up

## Background

In `src/app/page.tsx`, when a user signs up successfully, both a native browser `alert()` dialog **and** a `sonner` toast are shown. The `alert()` is blocking — it freezes the entire UI until dismissed. This is a leftover from early development and degrades the UX significantly. The toast alone is sufficient.

---

## Phase 1 — Remove the `alert()` Calls

**File to edit:** `src/app/page.tsx`

### Steps

1. Locate the sign-up success block (around line 29):
   ```ts
   alert("Account created! Open Mailpit at http://localhost:54324 to confirm your email before signing in.")
   toast.success("Account created! Open Mailpit at http://localhost:54324 to confirm your email before signing in.", {
     duration: 10000
   })
   ```

2. Delete the `alert(...)` line entirely.

3. Locate the error catch block (around line 35):
   ```ts
   } catch (error: any) {
     alert(`Error: ${error.message}`)
     toast.error(error.message)
   }
   ```

4. Delete the `alert(...)` line. Also change `error: any` to `error: unknown` and narrow it:
   ```ts
   } catch (err: unknown) {
     const message = err instanceof Error ? err.message : 'An unexpected error occurred';
     toast.error(message);
   }
   ```

---

## Phase 2 — Improve the Sign-Up Toast Copy

The current toast message references a localhost URL, which is environment-specific and confusing. Update it to be environment-neutral:

```ts
toast.success("Account created! Check your email to confirm before signing in.", {
  duration: 10000,
  description: "If using local dev, check Mailpit at :54324"
})
```

---

## Phase 3 — Smoke Test

1. Start containers: `docker-compose up`
2. Navigate to `/` (the splash/login page).
3. Enter a new email + password and click **Sign Up**.
4. Verify: a toast appears with the confirmation message — no browser `alert()` dialog.
5. Enter wrong credentials and click **Sign In**.
6. Verify: a toast error appears — no browser `alert()` dialog.

---

## Files Changed

| File | Action |
|---|---|
| `src/app/page.tsx` | Remove both `alert()` calls; narrow `catch (error: any)` to `catch (err: unknown)` |
