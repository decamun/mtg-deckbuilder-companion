# npm audit triage

_Last updated: 2026-05-12_

Triage snapshot taken after running `npm audit fix` (no `--force`).

---

## Fixed in this PR

All four of these were **runtime** transitive dependencies surfaced by
`npm audit --omit=dev`.

| Package | Old version | New version | Severity | How fixed |
|---|---|---|---|---|
| `fast-uri` | 3.1.0 | 3.1.2 | **High** | `npm audit fix` (lock-file bump) |
| `hono` | 4.12.14 | 4.12.18 | Moderate | `npm audit fix` (lock-file bump) |
| `ip-address` | 10.1.0 | 10.2.0 | Moderate | `npm audit fix` (lock-file bump) |
| `express-rate-limit` | 8.3.2 | 8.5.1 | Moderate | `npm audit fix` (lock-file bump) |

**Dependency chains (all runtime):**

- `fast-uri` ← `@modelcontextprotocol/sdk` → `ajv`
- `hono` ← `@hono/node-server` ← `@modelcontextprotocol/sdk`
- `ip-address` ← `express-rate-limit` ← `@modelcontextprotocol/sdk`

---

## Accepted risk (not fixable without breaking changes)

| Package | Version range | Severity | Advisory | Why not fixed |
|---|---|---|---|---|
| `postcss` (Next.js-bundled) | <8.5.10 | Moderate | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — XSS via unescaped `</style>` in CSS stringify | `npm audit fix --force` would downgrade `next` to 9.3.3, which is a breaking change. Track the Next.js release notes and upgrade when a patched release is available for the advisory range. |

**Risk assessment for the PostCSS advisory:**

- The vulnerability is in PostCSS's CSS-to-string serializer.  
- In Next.js 16, PostCSS runs exclusively at **build time** to process Tailwind/CSS imports. It does not process user-supplied CSS at request time.  
- There is no path for end-user input to reach the vulnerable serializer in this app's production runtime.  
- Severity is **moderate** (CVSS-based) and is accepted until a patched Next.js release is available.

---

## CI severity policy

The `ci.yml` audit step now runs:

```yaml
- name: npm audit (fail on high+)
  run: npm audit --omit=dev --audit-level=high
```

This fails the pipeline on **high** or **critical** findings.
Moderate findings (including the accepted-risk PostCSS advisory above) do not
block merges but remain visible in CI output.

---

## Follow-up

- Monitor Next.js security releases. When a release ≥16.3.0 ships that bumps
  the bundled PostCSS to ≥8.5.10, update `next` in `package.json` and run
  `npm audit fix` again.
- Dependabot is configured (`.github/dependabot.yml`) to open PRs for future
  dependency updates automatically.
