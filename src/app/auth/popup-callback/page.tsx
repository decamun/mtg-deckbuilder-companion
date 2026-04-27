"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

function PopupCallbackInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [canClose, setCanClose] = useState(false)

  useEffect(() => {
    const code = searchParams?.get("code")

    if (!code) {
      router.replace("/brew")
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        router.replace("/?error=auth_callback_error")
        return
      }
      // Notify the opener if this was opened as a popup/tab
      window.opener?.postMessage("auth-complete", window.location.origin)
      // Try to close — works for real popups; Arc and some browsers ignore it for tabs
      window.close()
      // Show fallback in case close() was ignored
      setCanClose(true)
    })
  }, [searchParams, router])

  if (canClose) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Signed in — you can close this tab.
        </p>
      </div>
    )
  }

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
