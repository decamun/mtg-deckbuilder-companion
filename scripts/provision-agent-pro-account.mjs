#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const TEST_EMAIL_PATTERN =
  /^(cursor|agent|test|e2e|qa|ci)[a-z0-9._+-]*@(example\.com|test\.com|idlebrew\.test)$/i

function usage() {
  console.log(`
Usage:
  npm run agent:pro-account -- --email cursor-agent@example.com --create --tier pro --password <password> --yes
  npm run agent:pro-account -- --email cursor-agent@example.com --create --tier free --password <password> --yes
  npm run agent:pro-account -- --email cursor-agent@example.com --tier pro --yes
  npm run agent:pro-account -- --email cursor-agent@example.com --tier free --yes
  npm run agent:pro-account -- --user-id <uuid> --email cursor-agent@example.com --tier pro --yes

Aliases:
  --enable   same as --tier pro
  --disable  same as --tier free

Requires:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Safety:
  - Mutations require --yes.
  - Email must look disposable/test-only by default.
  - Account creation requires --create and --password.
  - Set ALLOW_NON_TEST_PRO_ACCOUNT=1 only for an intentional break-glass run.
`.trim())
}

function parseArgs(argv) {
  const args = {
    email: null,
    userId: null,
    password: null,
    tier: 'pro',
    create: false,
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
      case '--password':
        args.password = argv[++i] ?? null
        break
      case '--tier': {
        const tier = argv[++i]
        if (tier !== 'pro' && tier !== 'free') {
          throw new Error('--tier must be "pro" or "free".')
        }
        args.tier = tier
        break
      }
      case '--create':
        args.create = true
        break
      case '--enable':
        args.tier = 'pro'
        break
      case '--disable':
        args.tier = 'free'
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

function assertPassword(password) {
  if (!password) {
    throw new Error('--password is required when --create is used.')
  }
  if (password.length < 12) {
    throw new Error('--password must be at least 12 characters.')
  }
}

async function findUserByEmail(supabase, email) {
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user

    if (data.users.length < perPage) return null
    page += 1
  }
}

async function createUser(supabase, email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { created_by: 'agent-pro-account-helper' },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error(`Supabase did not return a user for ${email}.`)
  return data.user
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

  if (args.create) {
    assertPassword(args.password)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let created = false
  let userId = args.userId
  if (!userId) {
    const existingUser = await findUserByEmail(supabase, args.email)
    if (existingUser) {
      userId = existingUser.id
    } else if (args.create) {
      const createdUser = await createUser(supabase, args.email, args.password)
      userId = createdUser.id
      created = true
    }
  }

  if (!userId) {
    throw new Error(
      `No Supabase auth user found for ${args.email}. Add --create --password <password> to create one.`
    )
  }

  const { data, error } = await supabase
    .from('user_account_flags')
    .upsert(
      {
        user_id: userId,
        idlebrew_pro_subscribed: args.tier === 'pro',
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
        created,
        tier: data.idlebrew_pro_subscribed ? 'pro' : 'free',
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
