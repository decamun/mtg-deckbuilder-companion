"use client"

import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

function PopupCallbackInner() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get("code")

    if (!code) {
      if (window.opener) {
        window.close()
      } else {
        window.location.href = "/brew"
      }
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (window.opener) {
        if (!error) {
          window.opener.postMessage("auth-complete", window.location.origin)
        }
        window.close()
      } else {
        window.location.href = error ? "/?error=auth_callback_error" : "/brew"
      }
    })
  }, [searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}

export default function PopupCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </div>
      }
    >
      <PopupCallbackInner />
    </Suspense>
  )
}
