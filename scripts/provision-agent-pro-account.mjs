#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const TEST_EMAIL_PATTERN =
  /^(cursor|agent|test|e2e|qa|ci)[a-z0-9._+-]*@(example\.com|test\.com|idlebrew\.test)$/i

function usage() {
  console.log(`
Usage:
  node scripts/provision-agent-pro-account.mjs --email cursor-agent@example.com --yes
  node scripts/provision-agent-pro-account.mjs --user-id <uuid> --email cursor-agent@example.com --yes
  node scripts/provision-agent-pro-account.mjs --email cursor-agent@example.com --disable --yes

Requires:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Safety:
  - Mutations require --yes.
  - Email must look disposable/test-only by default.
  - Set ALLOW_NON_TEST_PRO_ACCOUNT=1 only for an intentional break-glass run.
`.trim())
}

function parseArgs(argv) {
  const args = {
    email: null,
    userId: null,
    enable: true,
    yes: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--email':
        args.email = argv[++i] ?? null
        break
      case '--user-id':
        args.userId = argv[++i] ?? null
        break
      case '--enable':
        args.enable = true
        break
      case '--disable':
        args.enable = false
        break
      case '--yes':
        args.yes = true
        break
      case '--help':
      case '-h':
        args.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function assertTestEmail(email) {
  if (!email) {
    throw new Error('--email is required so the target account is auditable.')
  }

  if (TEST_EMAIL_PATTERN.test(email)) return

  if (process.env.ALLOW_NON_TEST_PRO_ACCOUNT === '1') {
    console.warn('ALLOW_NON_TEST_PRO_ACCOUNT=1 set; allowing non-test email.')
    return
  }

  throw new Error(
    `Refusing to provision non-test email "${email}". Use a disposable address like cursor-<task>@example.com.`
  )
}

async function findUserIdByEmail(supabase, email) {
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id

    if (data.users.length < perPage) return null
    page += 1
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }

  assertTestEmail(args.email)

  if (!args.yes) {
    throw new Error('Refusing to mutate account flags without --yes.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const userId = args.userId ?? (await findUserIdByEmail(supabase, args.email))
  if (!userId) {
    throw new Error(`No Supabase auth user found for ${args.email}. Create and confirm the test user first.`)
  }

  const { data, error } = await supabase
    .from('user_account_flags')
    .upsert(
      {
        user_id: userId,
        idlebrew_pro_subscribed: args.enable,
      },
      { onConflict: 'user_id' }
    )
    .select('user_id, idlebrew_pro_subscribed, idlebrew_pro_notify_me, updated_at')
    .single()

  if (error) throw new Error(error.message)

  console.log(
    JSON.stringify(
      {
        email: args.email,
        userId: data.user_id,
        idlebrewProSubscribed: data.idlebrew_pro_subscribed,
        idlebrewProNotifyMe: data.idlebrew_pro_notify_me,
        updatedAt: data.updated_at,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
