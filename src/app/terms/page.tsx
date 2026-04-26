import Link from "next/link"
import type { Metadata } from "next"
import { BackButton } from "@/components/BackButton"

export const metadata: Metadata = {
  title: "Terms of Service — idlebrew",
}

export default function TermsOfService() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <BackButton />
        <h1 className="text-3xl font-bold mb-2 mt-4">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">Last updated: April 26, 2026</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Acceptance of Terms</h2>
        <p className="text-muted-foreground leading-relaxed">
          By accessing or using idlebrew ("the Service"), you agree to be bound by these Terms of
          Service. If you do not agree to these terms, please do not use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Description of Service</h2>
        <p className="text-muted-foreground leading-relaxed">
          idlebrew is a deck-building companion for Magic: The Gathering. It allows users to search
          for commanders, create and manage deck lists, and receive card suggestions. The Service is
          provided free of charge and is subject to change at any time without notice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">User Accounts</h2>
        <p className="text-muted-foreground leading-relaxed">
          You may create an account using an email address or a supported OAuth provider (Google or
          Facebook). You are responsible for maintaining the confidentiality of your account
          credentials and for all activity that occurs under your account. You must notify us
          immediately of any unauthorized use of your account.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          You must be at least 13 years of age to use the Service. By creating an account, you
          represent that you meet this requirement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">User Content</h2>
        <p className="text-muted-foreground leading-relaxed">
          You retain ownership of any deck lists, card selections, and other content you create
          within the Service ("User Content"). By using the Service, you grant idlebrew a
          non-exclusive, worldwide, royalty-free license to store and display your User Content
          solely as necessary to provide the Service to you.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          You agree not to upload or submit any content that is unlawful, infringing, defamatory,
          or otherwise objectionable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Intellectual Property</h2>
        <p className="text-muted-foreground leading-relaxed">
          Magic: The Gathering card names, artwork, and associated content are the intellectual
          property of Wizards of the Coast. idlebrew is not affiliated with, endorsed by, or
          sponsored by Wizards of the Coast. Card data is sourced from{" "}
          <span className="font-medium text-foreground">Scryfall</span> and is used in accordance
          with their terms of service.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The idlebrew name, logo, and original software are owned by idlebrew and may not be
          copied, reproduced, or distributed without express written permission.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Prohibited Conduct</h2>
        <p className="text-muted-foreground leading-relaxed">You agree not to:</p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure</li>
          <li>Scrape, crawl, or otherwise systematically extract data from the Service without permission</li>
          <li>Interfere with or disrupt the integrity or performance of the Service</li>
          <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Disclaimer of Warranties</h2>
        <p className="text-muted-foreground leading-relaxed">
          The Service is provided "as is" and "as available" without warranty of any kind, express
          or implied, including but not limited to warranties of merchantability, fitness for a
          particular purpose, or non-infringement. We do not warrant that the Service will be
          uninterrupted, error-free, or free of viruses or other harmful components.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Limitation of Liability</h2>
        <p className="text-muted-foreground leading-relaxed">
          To the fullest extent permitted by applicable law, idlebrew shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages, including but not
          limited to loss of data, loss of profits, or loss of goodwill, arising out of or in
          connection with your use of or inability to use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Termination</h2>
        <p className="text-muted-foreground leading-relaxed">
          We reserve the right to suspend or terminate your account and access to the Service at
          our sole discretion, without notice, for conduct that we believe violates these Terms or
          is harmful to other users, idlebrew, or third parties. You may delete your account at any
          time by following the instructions on our{" "}
          <Link href="/data-deletion" className="text-primary hover:underline">
            data deletion page
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Changes to Terms</h2>
        <p className="text-muted-foreground leading-relaxed">
          We may update these Terms of Service from time to time. We will notify users of material
          changes by updating the date at the top of this page. Continued use of the Service after
          any such changes constitutes your acceptance of the new terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Governing Law</h2>
        <p className="text-muted-foreground leading-relaxed">
          These Terms shall be governed by and construed in accordance with applicable law, without
          regard to conflict of law principles.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-muted-foreground leading-relaxed">
          For questions about these Terms, email us at{" "}
          <a href="mailto:privacy@idlebrew.app" className="text-primary hover:underline">
            privacy@idlebrew.app
          </a>
          . See also our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </main>
  )
}
