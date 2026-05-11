"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { getCardsByIds, getCardImageUrl } from "@/lib/scryfall"
import type { Deck } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type LikedDeckEmbed = Pick<
  Deck,
  "id" | "name" | "format" | "cover_image_scryfall_id" | "is_public" | "user_id" | "commander_scryfall_ids"
>

type LikedQueryRow = {
  created_at: string
  decks: LikedDeckEmbed | LikedDeckEmbed[] | null
}

export default function LikedDecksPage() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Deck[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session?.user)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoggedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!loggedIn) {
      queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from("deck_likes")
        .select(
          `
          created_at,
          decks (
            id,
            name,
            format,
            cover_image_scryfall_id,
            is_public,
            user_id,
            commander_scryfall_ids
          )
        `,
        )
        .order("created_at", { ascending: false })

      if (cancelled) return
      if (error) {
        setItems([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as LikedQueryRow[]
      const decksRaw = rows
        .map((r) => {
          const d = r.decks
          if (!d) return null
          return Array.isArray(d) ? d[0] ?? null : d
        })
        .filter(Boolean) as Deck[]
      const coverIds = decksRaw.map((d) => d.cover_image_scryfall_id).filter(Boolean) as string[]
      const coverCards = coverIds.length ? await getCardsByIds(coverIds) : []
      const coverMap = new Map(coverCards.map((c) => [c.id, c]))

      const next: Deck[] = []
      for (const row of rows) {
        const raw = row.decks
        const d = !raw ? null : Array.isArray(raw) ? raw[0] ?? null : raw
        if (!d) continue
        next.push({
          ...d,
          commander_scryfall_ids: d.commander_scryfall_ids ?? [],
          is_public: !!d.is_public,
          cover_url: d.cover_image_scryfall_id
            ? getCardImageUrl(coverMap.get(d.cover_image_scryfall_id))
            : undefined,
        } as Deck)
      }
      setItems(next)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, loggedIn])

  if (!authReady || loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-bold text-foreground">Liked decks</h1>
        <p className="max-w-md text-muted-foreground">Log in to see decks you have liked.</p>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => window.dispatchEvent(new CustomEvent("open-login-dialog"))}
        >
          Log In
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-foreground">Liked decks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Decks you have saved with a like, newest first.</p>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          You have not liked any decks yet.{" "}
          <Link href="/browse" className="text-primary underline-offset-4 hover:underline">
            Browse public decks
          </Link>{" "}
          or open a shared deck and tap the heart.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((deck) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => router.push(`/decks/${deck.id}`)}
              className="group relative cursor-pointer"
            >
              <Card className="h-64 overflow-hidden border-border bg-card transition-all duration-300 hover:border-primary/50">
                <div className="absolute inset-0 z-0">
                  {deck.cover_url ? (
                    <>
                      <img
                        src={deck.cover_url}
                        alt=""
                        className="h-full w-full object-cover opacity-40 transition-opacity group-hover:opacity-60"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                    </>
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-muted to-card opacity-50" />
                  )}
                </div>
                <CardContent className="relative z-10 flex h-full flex-col justify-end p-5">
                  <h2 className="font-heading text-lg font-bold text-foreground">{deck.name}</h2>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {deck.format ? deck.format.toUpperCase() : "Format"}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
