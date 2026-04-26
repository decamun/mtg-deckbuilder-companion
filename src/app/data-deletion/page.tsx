import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Data Deletion — idlebrew",
}

export default function DataDeletion() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Data Deletion</h1>
          <p className="text-muted-foreground text-sm">Last updated: April 26, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What data idlebrew holds</h2>
          <p className="text-muted-foreground leading-relaxed">
            When you sign in with Google or Facebook, idlebrew stores your email address and
            display name alongside any deck lists and card data you create. No other personal
            information is retained.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">How to request deletion</h2>
          <p className="text-muted-foreground leading-relaxed">
            To have all your data permanently deleted, send an email to{" "}
            <a href="mailto:privacy@idlebrew.app" className="text-primary hover:underline">
              privacy@idlebrew.app
            </a>{" "}
            with the subject line <span className="font-medium text-foreground">Data Deletion Request</span>.
            Include the email address associated with your account. We will confirm deletion within
            30 days.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Deletion removes your account, all deck lists, and all card data linked to your
            account. This action is irreversible.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Disconnecting Facebook</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you signed in with Facebook and want to revoke idlebrew&apos;s access to your
            Facebook account independently of a full data deletion, you can do so from your
            Facebook settings:
          </p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1 ml-2">
            <li>Go to Facebook Settings &amp; Privacy → Settings</li>
            <li>Select Security and Login → Apps and Websites</li>
            <li>Find <span className="font-medium text-foreground">idlebrew</span> and click Remove</li>
          </ol>
          <p className="text-muted-foreground leading-relaxed">
            This revokes Facebook&apos;s token but does not automatically delete your idlebrew
            account or data. Email us if you also want the account deleted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions? Email{" "}
            <a href="mailto:privacy@idlebrew.app" className="text-primary hover:underline">
              privacy@idlebrew.app
            </a>{" "}
            or see our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              full privacy policy
            </Link>
            .
          </p>
        </section>
    </main>
  )
}
