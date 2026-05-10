import assert from 'node:assert/strict'

function assertIncludes(file, expected) {
  assert(
    file.includes(expected),
    `Expected file to include: ${expected}`
  )
}

const [{ isModelId, ALL_MODELS }, { isValidEdhrecSlug }] = await Promise.all([
  import('../src/lib/agent-quota.ts'),
  import('../src/lib/edhrec.ts'),
])

for (const model of ALL_MODELS) {
  assert.equal(isModelId(model), true)
}
assert.equal(isModelId('unknown/model'), false)
assert.equal(isModelId(null), false)

assert.equal(isValidEdhrecSlug('atraxa-praetors-voice'), true)
assert.equal(isValidEdhrecSlug('A traxa'), false)
assert.equal(isValidEdhrecSlug('../secret'), false)
assert.equal(isValidEdhrecSlug('atraxa%2fpraetors-voice'), false)
assert.equal(isValidEdhrecSlug('atraxa.praetors'), false)
assert.equal(isValidEdhrecSlug(''), false)
assert.equal(isValidEdhrecSlug('a'.repeat(121)), false)

const chatRoute = await import('node:fs/promises').then((fs) =>
  fs.readFile('src/app/api/agent/chat/route.ts', 'utf8')
)
assertIncludes(chatRoute, 'Unable to record usage for this request')
assertIncludes(chatRoute, 'status: 503')

const callbackRoute = await import('node:fs/promises').then((fs) =>
  fs.readFile('src/app/auth/callback/route.ts', 'utf8')
)
assertIncludes(callbackRoute, 'getTrustedRedirectOrigin')

const trustedSite = await import('node:fs/promises').then((fs) =>
  fs.readFile('src/lib/trusted-site-url.ts', 'utf8')
)
assertIncludes(trustedSite, 'x-forwarded-host')
assert.equal(trustedSite.includes('process.env.VERCEL_URL'), false)

const launchMigration = await import('node:fs/promises').then((fs) =>
  fs.readFile('supabase/migrations/20260510120000_social_launch_indexes_rls_and_advisor.sql', 'utf8')
)
assertIncludes(launchMigration, 'decks_user_id_idx')
assertIncludes(launchMigration, 'rls_auto_enable')
assertIncludes(launchMigration, 'Users read own oauth tokens')

const migration = await import('node:fs/promises').then((fs) =>
  fs.readFile('supabase/migrations/20260502211949_p0_security_remediation.sql', 'utf8')
)
assertIncludes(migration, 'CREATE POLICY "Users insert own agent log"')
assertIncludes(migration, 'WITH CHECK ((select auth.uid()) = user_id)')
assertIncludes(migration, 'agent_call_log_model_check')
assertIncludes(migration, 'request_count bigint NOT NULL DEFAULT 0')
assertIncludes(migration, 'SET search_path = public')

console.log('P0 security helper checks passed')
