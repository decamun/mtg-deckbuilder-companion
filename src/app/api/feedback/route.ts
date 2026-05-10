import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  message: z.string().trim().min(10).max(8000),
  email: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined
    if (typeof val !== 'string') return val
    const t = val.trim()
    return t === '' ? undefined : t
  }, z.string().email().optional()),
  turnstileToken: z.string().min(1),
})

async function verifyTurnstileToken(token: string, remoteip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return false

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (remoteip) body.set('remoteip', remoteip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })

  const data = (await res.json()) as { success?: boolean }
  return data.success === true
}

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { message: 'Feedback email is not configured on this deployment.' },
      { status: 503 }
    )
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(' ')
    return NextResponse.json({ message: msg || 'Invalid request' }, { status: 400 })
  }

  const { message, email, turnstileToken } = parsed.data

  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const remoteip = forwarded?.split(',')[0]?.trim()

  const ok = await verifyTurnstileToken(turnstileToken, remoteip)
  if (!ok) {
    return NextResponse.json({ message: 'Captcha verification failed. Please try again.' }, { status: 400 })
  }

  const to = process.env.FEEDBACK_TO_EMAIL ?? 'feedback@idlebrew.app'
  const from = process.env.FEEDBACK_FROM_EMAIL ?? 'Idlebrew <noreply@idlebrew.app>'

  const resend = new Resend(process.env.RESEND_API_KEY)

  const subject = `[idlebrew feedback] ${email ? `from ${email}` : 'anonymous'}`
  const text = [
    email ? `Reply-To address (optional field): ${email}` : 'No reply email provided.',
    '',
    message,
  ].join('\n')

  const { error } = await resend.emails.send({
    from,
    to,
    ...(email ? { replyTo: email } : {}),
    subject,
    text,
  })

  if (error) {
    console.error('[feedback] Resend error:', error)
    return NextResponse.json({ message: 'Could not send feedback. Please try again later.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
