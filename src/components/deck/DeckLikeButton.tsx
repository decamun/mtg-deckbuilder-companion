"use client"

import { useCallback, useEffect, useState } from "react"
import { Heart } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"

interface Props {
  deckId: string
}

export function DeckLikeButton({ deckId }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const uid = user?.id ?? null
    setUserId(uid)

    const { data: n, error: countError } = await supabase.rpc("deck_like_count", {
      p_deck_id: deckId,
    })
    if (countError) {
      setCount(null)
    } else {
      setCount(typeof n === "number" ? n : Number(n))
    }

    if (uid) {
      const { data: row } = await supabase
        .from("deck_likes")
        .select("deck_id")
        .eq("deck_id", deckId)
        .eq("user_id", uid)
        .maybeSingle()
      setLiked(!!row)
    } else {
      setLiked(false)
    }
    setLoading(false)
  }, [deckId])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(() => {
        void refresh()
      })
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  const toggle = async () => {
    if (!userId) {
      window.dispatchEvent(new CustomEvent("open-login-dialog"))
      return
    }
    if (busy) return
    setBusy(true)
    if (liked) {
      const { error } = await supabase.from("deck_likes").delete().eq("deck_id", deckId).eq("user_id", userId)
      if (error) {
        toast.error(error.message)
        setBusy(false)
        return
      }
      setLiked(false)
      setCount((c) => (c != null ? Math.max(0, c - 1) : 0))
    } else {
      const { error } = await supabase.from("deck_likes").insert({ deck_id: deckId, user_id: userId })
      if (error) {
        toast.error(error.message)
        setBusy(false)
        return
      }
      setLiked(true)
      setCount((c) => (c != null ? c + 1 : 1))
    }
    setBusy(false)
  }

  const displayCount = count ?? 0

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading || busy}
      title={userId ? (liked ? "Unlike" : "Like") : "Log in to like"}
      className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
    >
      <Heart
        className={`w-3.5 h-3.5 shrink-0 ${liked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
      />
      <span className="tabular-nums text-muted-foreground">{loading ? "—" : displayCount}</span>
    </button>
  )
}
