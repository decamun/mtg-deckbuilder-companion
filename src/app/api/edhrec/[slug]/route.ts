import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { isValidEdhrecSlug } from "@/lib/edhrec"

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://edhrec.com/",
  Origin: "https://edhrec.com",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
}

const SUCCESS_CACHE = "private, max-age=3600, stale-while-revalidate=86400"
const MISS_CACHE = "private, max-age=300"
const EDHREC_RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 }

/** Parse whatever shape EDHREC returns into a normalised { decklist } string */
function normalise(data: unknown): { decklist: string } | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>

  // Shape 1: { deck: "1 Sol Ring\n..." }
  if (typeof d.deck === "string") return { decklist: d.deck }
  // Shape 2: { decklist: "1 Sol Ring\n..." }
  if (typeof d.decklist === "string") return { decklist: d.decklist }
  // Shape 3: { deck: { decklist: "..." } }
  if (d.deck && typeof d.deck === "object") {
    const inner = (d.deck as Record<string, unknown>).decklist
    if (typeof inner === "string") return { decklist: inner }
  }
  // Shape 4: { names: [...], qty: [...] }
  if (Array.isArray(d.names) && Array.isArray(d.qty)) {
    const names = d.names as string[]
    const qty = d.qty as number[]
    const lines = names.map((n, i) => `${qty[i] ?? 1} ${n}`)
    return { decklist: lines.join("\n") }
  }
  return null
}

interface EdhrecCardview { label?: string; name?: string; inclusion?: number; num_decks?: number }
interface EdhrecCardlist { cardviews?: EdhrecCardview[] }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!isValidEdhrecSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const rateLimit = checkRateLimit(`edhrec:${user.id}`, EDHREC_RATE_LIMIT)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": rateLimit.retryAfter.toString() } }
    )
  }

  // Primary: average-decks endpoint
  try {
    const res = await fetch(
      `https://json.edhrec.com/average-decks/${slug}.json`,
      { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) }
    )

    if (res.ok) {
      const data = await res.json()
      // EDHREC returns 200 + { error: "not_found" } for unknown commanders
      if (!data.error) {
        const normalised = normalise(data)
        if (normalised) {
          return NextResponse.json(normalised, {
            headers: { "Cache-Control": SUCCESS_CACHE },
          })
        }
        console.warn("[edhrec] average-decks unknown shape for", slug, Object.keys(data))
      } else {
        console.warn(`[edhrec] average-decks error body for ${slug}:`, data.error)
      }
    } else {
      console.warn(`[edhrec] average-decks returned ${res.status} for ${slug}`)
    }
  } catch (e) {
    console.warn("[edhrec] average-decks fetch error:", e)
  }

  // Fallback: pages/commanders endpoint (different CF policy, has cardlists)
  try {
    const res = await fetch(
      `https://json.edhrec.com/pages/commanders/${slug}.json`,
      { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) }
    )

    if (res.ok) {
      const data = await res.json()
      const cardlists: EdhrecCardlist[] = data?.container?.json_dict?.cardlists ?? []
      // Deduplicate; keep highest inclusion % per card name; sort and cap at 99
      const seen = new Map<string, number>()
      for (const list of cardlists) {
        for (const cv of list?.cardviews ?? []) {
          const name: string | undefined = cv?.label ?? cv?.name
          const inclusion: number = cv?.inclusion ?? cv?.num_decks ?? 0
          if (name && (!seen.has(name) || seen.get(name)! < inclusion)) {
            seen.set(name, inclusion)
          }
        }
      }
      const lines = Array.from(seen.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 99)
        .map(([name]) => `1 ${name}`)
      if (lines.length > 0) {
        return NextResponse.json(
          { decklist: lines.join("\n") },
          { headers: { "Cache-Control": SUCCESS_CACHE } }
        )
      }
    }

    console.warn(`[edhrec] pages/commanders returned ${res.status} for ${slug}`)
  } catch (e) {
    console.warn("[edhrec] pages/commanders fetch error:", e)
  }

  return NextResponse.json(
    { error: "unavailable" },
    { status: 503, headers: { "Cache-Control": MISS_CACHE } }
  )
}
