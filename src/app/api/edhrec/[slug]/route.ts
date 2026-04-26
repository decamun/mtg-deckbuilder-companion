import { NextRequest, NextResponse } from "next/server"

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

/** Parse whatever shape EDHREC returns into a normalised { decklist } string */
function normalise(data: any): { decklist: string } | null {
  // Shape 1: { deck: "1 Sol Ring\n..." }
  if (typeof data?.deck === "string") return { decklist: data.deck }
  // Shape 2: { decklist: "1 Sol Ring\n..." }
  if (typeof data?.decklist === "string") return { decklist: data.decklist }
  // Shape 3: { deck: { decklist: "..." } }
  if (typeof data?.deck?.decklist === "string")
    return { decklist: data.deck.decklist }
  // Shape 4: { names: [...], qty: [...] }
  if (Array.isArray(data?.names) && Array.isArray(data?.qty)) {
    const lines = (data.names as string[]).map(
      (n: string, i: number) => `${(data.qty as number[])[i] ?? 1} ${n}`
    )
    return { decklist: lines.join("\n") }
  }
  return null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

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
        if (normalised) return NextResponse.json(normalised)
        console.warn("[edhrec] average-decks unknown shape for", slug, data)
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
      const cardlists: any[] = data?.container?.json_dict?.cardlists ?? []
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
      if (lines.length > 0) return NextResponse.json({ decklist: lines.join("\n") })
    }

    console.warn(`[edhrec] pages/commanders returned ${res.status} for ${slug}`)
  } catch (e) {
    console.warn("[edhrec] pages/commanders fetch error:", e)
  }

  return NextResponse.json({ error: "unavailable" }, { status: 503 })
}
