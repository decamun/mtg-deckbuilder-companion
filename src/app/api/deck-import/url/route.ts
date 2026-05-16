import { NextResponse } from "next/server"
import { z } from "zod"
import { importExternalDeckFromUrl } from "@/lib/external-deck-providers"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
})

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ message: "A deck URL is required" }, { status: 400 })
  }

  try {
    const result = await importExternalDeckFromUrl(parsed.data.url)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed"
    return NextResponse.json({ message }, { status: 422 })
  }
}
