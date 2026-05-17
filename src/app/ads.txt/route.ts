import { NextResponse } from 'next/server'

/**
 * Serves ads.txt from the `ADS_TXT` environment variable (multi-line).
 * Human-provided records ship via Vercel env (issue #209); avoid committing
 * live seller lines to the repo.
 */
export async function GET() {
  const body =
    process.env.ADS_TXT?.trim() ??
    `# AdSense / ads.txt records are not configured in this environment.\n# Set ADS_TXT (see https://support.google.com/adsense/answer/7532444).\n`

  return new NextResponse(body.endsWith('\n') ? body : `${body}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
