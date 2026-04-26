import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  try {
    const res = await fetch(
      `https://json.edhrec.com/average-decks/${slug}.json`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; idlebrew/1.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) {
      return NextResponse.json({ error: "not_found" }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 })
  }
}
