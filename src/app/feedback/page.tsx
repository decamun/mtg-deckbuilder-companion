import type { Metadata } from "next"
import { BackButton } from "@/components/BackButton"
import { FeedbackForm } from "@/components/feedback/FeedbackForm"

export const metadata: Metadata = {
  title: "Feedback — idlebrew",
  description: "Share ideas and help us improve idlebrew.",
}

export default function FeedbackPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <BackButton />
        <h1 className="text-3xl font-bold mb-2 mt-4">Feedback</h1>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p className="text-foreground/90 text-lg leading-snug">
            Thank you for being an idlebrew adopter. We&apos;d love to hear how we can make things
            better!
          </p>
          <p>
            Whether it&apos;s a bug, a rough edge, or an idea for the brew workflow or assistant,
            your note goes straight to our team at{" "}
            <a
              href="mailto:feedback@idlebrew.app"
              className="text-primary hover:underline"
            >
              feedback@idlebrew.app
            </a>
            . Add your email below if you&apos;d like a reply.
          </p>
          <p className="text-sm">
            Complete the quick verification before sending — it helps us keep spam out so we can
            focus on real feedback.
          </p>
        </div>
      </div>

      <FeedbackForm siteKey={siteKey} />
    </main>
  )
}
