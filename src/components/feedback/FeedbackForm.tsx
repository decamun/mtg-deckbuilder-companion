"use client"

import { useCallback, useRef, useState } from "react"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type FeedbackFormProps = {
  siteKey: string | undefined
}

function turnstileErrorToast(code: string) {
  // https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
  if (code === "110200") {
    toast.error(
      "Captcha can’t run on this hostname yet (Turnstile error 110200). In Cloudflare Dashboard → Turnstile → your widget → Hostname Management, add this site’s domain.",
      { duration: 12_000 }
    )
    return
  }
  toast.error("Captcha could not load. Refresh the page or try again.")
}

export function FeedbackForm({ siteKey }: FeedbackFormProps) {
  const turnstileRef = useRef<TurnstileInstance>(null)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const resetChallenge = useCallback(() => {
    setToken(null)
    turnstileRef.current?.reset()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteKey) return

    if (!token) {
      toast.error("Please complete the captcha.")
      return
    }

    setPending(true)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          email: email.trim() || undefined,
          turnstileToken: token,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string }

      if (!res.ok) {
        toast.error(data.message ?? "Something went wrong.")
        resetChallenge()
        return
      }

      toast.success("Thanks — your feedback was sent.")
      setMessage("")
      setEmail("")
      resetChallenge()
    } catch {
      toast.error("Network error. Please try again.")
      resetChallenge()
    } finally {
      setPending(false)
    }
  }

  if (!siteKey) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-4 py-3">
        This form is not available: set{" "}
        <code className="text-xs">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> and{" "}
        <code className="text-xs">TURNSTILE_SECRET_KEY</code> for captcha, and{" "}
        <code className="text-xs">RESEND_API_KEY</code> (with a verified sender in{" "}
        <code className="text-xs">FEEDBACK_FROM_EMAIL</code>) to enable feedback email.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="feedback-message">Message</Label>
        <Textarea
          id="feedback-message"
          name="message"
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Bug reports, ideas, or anything else you want us to know…"
          className="min-h-[140px] resize-y"
        />
        <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-email">Your email (optional)</Label>
        <Input
          id="feedback-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <p className="text-xs text-muted-foreground">
          If you want a reply, include an address we can reach you at.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Verification</span>
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          options={{ theme: "dark" }}
          onSuccess={setToken}
          onExpire={() => setToken(null)}
          onError={(code) => {
            setToken(null)
            turnstileErrorToast(String(code))
          }}
        />
      </div>

      <Button type="submit" disabled={pending || !token} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  )
}
