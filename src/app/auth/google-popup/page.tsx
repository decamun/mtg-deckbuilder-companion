"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase/client"

export default function GooglePopupPage() {
  useEffect(() => {
    supabase.auth
      .signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/popup-callback`,
          skipBrowserRedirect: true,
        },
      })
      .then(({ data, error }) => {
        if (error || !data.url) {
          window.close()
          return
        }
        window.location.href = data.url
      })
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Redirecting to Google…</p>
    </div>
  )
}
