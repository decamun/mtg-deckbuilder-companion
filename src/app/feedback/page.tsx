import type { Metadata } from "next"
import { BackButton } from "@/components/BackButton"
import { FeedbackForm } from "@/components/feedback/FeedbackForm"

export const metadata: Metadata = {
  title: "Feedback — idlebrew",
  description: "Send feedback to the idlebrew team.",
}

export default function FeedbackPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <BackButton />
        <h1 className="text-3xl font-bold mb-2 mt-4">Feedback</h1>
        <p className="text-muted-foreground leading-relaxed">
          Share bugs, suggestions, or general thoughts. Messages are sent to{" "}
          <a
            href="mailto:feedback@idlebrew.app"
            className="text-primary hover:underline"
          >
            feedback@idlebrew.app
          </a>
          . Please complete the verification below so we can reduce spam.
        </p>
      </div>

      <FeedbackForm siteKey={siteKey} />
    </main>
  )
}
