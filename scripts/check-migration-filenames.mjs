#!/usr/bin/env node
// Reject migration filenames that look like wall-clock auto-stamps from
// `supabase migration new`. Those are the fingerprint of an agent applying
// SQL straight to prod from a dev branch and leaving rows in
// `supabase_migrations.schema_migrations` that do not match what eventually
// merges to main.
//
// Convention: the filename's HHMMSS portion must be either
//   - 0000XX  (midnight + small ordinal, e.g. 20240422000005), or
//   - XXXX00  (a hand-picked HH:MM with seconds=00, e.g. 20260430185000)
// Any other 6-digit suffix is rejected.
//
// Usage: node scripts/check-migration-filenames.mjs <file>...
// If no files are passed, reads added files in the PR diff against origin/main.

import { execSync } from "node:child_process";
import { basename } from "node:path";

const VALID = /^(\d{8})(0000\d{2}|\d{4}00)_[a-z0-9_]+\.sql$/;

function addedMigrationsInPr() {
  const base = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main";
  const out = execSync(
    `git diff --name-only --diff-filter=A ${base}...HEAD -- supabase/migrations`,
    { encoding: "utf8" }
  );
  return out.split("\n").filter((line) => line.endsWith(".sql"));
}

const argv = process.argv.slice(2);
const files = argv.length > 0 ? argv : addedMigrationsInPr();

if (files.length === 0) {
  console.log("No new migration files to check.");
  process.exit(0);
}

const failures = [];
for (const file of files) {
  const name = basename(file);
  if (!VALID.test(name)) {
    failures.push(file);
  }
}

if (failures.length === 0) {
  console.log(`Checked ${files.length} migration file(s); all pass.`);
  process.exit(0);
}

console.error("Migration filenames look like wall-clock auto-stamps:");
for (const file of failures) {
  console.error(`  - ${file}`);
}
console.error("");
console.error("Rename so the HHMMSS suffix is either 0000XX (e.g. 000000, 000001)");
console.error("or HHMM00 (e.g. 185000, 120000). See AGENTS.md for the why.");
process.exit(1);
