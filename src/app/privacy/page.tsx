import Link from "next/link"
import type { Metadata } from "next"
import { BackButton } from "@/components/BackButton"

export const metadata: Metadata = {
  title: "Privacy Policy — idlebrew",
}

export default function PrivacyPolicy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold mb-2 mt-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: May 2, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What we collect</h2>
          <p className="text-muted-foreground leading-relaxed">
            When you create an account or sign in with Google or Facebook, we receive your email
            address and display name from that provider. We store this alongside any decks, card
            lists, primers, deck versions, MCP/API-key metadata, and agent usage records you create
            within idlebrew.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We do not collect payment information, physical addresses, or any data beyond what is
            necessary to operate the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">How we use your data</h2>
          <p className="text-muted-foreground leading-relaxed">
            Your data is used solely to provide the idlebrew service — authenticating your sessions,
            storing your deck lists, powering AI-assisted deck edits, and protecting usage limits.
            We do not sell, rent, or share your personal information with third parties for
            marketing purposes.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Decks are public by default so you can share and host them on idlebrew. Public deck pages
            may include deck names, descriptions, card lists, primers, and deck history. You can
            change a deck&apos;s visibility in its settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Third-party services</h2>
          <p className="text-muted-foreground leading-relaxed">
            idlebrew relies on the following services, each with their own privacy policies:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>
              <span className="font-medium text-foreground">Supabase</span> — database and
              authentication (supabase.com/privacy)
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel</span> — hosting and deployment
              (vercel.com/legal/privacy-policy)
            </li>
            <li>
              <span className="font-medium text-foreground">Scryfall</span> — Magic: The Gathering
              card data (scryfall.com/docs/privacy)
            </li>
            <li>
              <span className="font-medium text-foreground">EDHREC</span> — commander average deck
              and recommendation data used during brew creation (edhrec.com/privacy)
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel AI Gateway and model providers</span>{" "}
              — AI-assisted deck-building requests and responses
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel Analytics and Speed Insights</span>{" "}
              — aggregate product analytics and performance measurement
            </li>
            <li>
              <span className="font-medium text-foreground">Google</span> — optional sign-in
              (policies.google.com/privacy)
            </li>
            <li>
              <span className="font-medium text-foreground">Facebook</span> — optional sign-in
              (facebook.com/privacy/policy)
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Data retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            Your account, deck data, deck versions, and API-key audit metadata are retained for as
            long as your account is active. If you request deletion, all personal data and deck
            content associated with your account will be permanently removed within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may request access to, correction of, or deletion of your personal data at any
            time. See our{" "}
            <Link href="/data-deletion" className="text-primary hover:underline">
              data deletion page
            </Link>{" "}
            for instructions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For privacy-related questions, email us at{" "}
            <a href="mailto:privacy@idlebrew.app" className="text-primary hover:underline">
              privacy@idlebrew.app
            </a>
            .
          </p>
        </section>
    </main>
  )
}
