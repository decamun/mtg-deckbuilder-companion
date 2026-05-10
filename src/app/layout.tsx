import type { Metadata } from "next";
import { Armata, Audiowide } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TopNav } from "@/components/TopNav";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from '@vercel/analytics/next';

const armata = Armata({
  variable: "--font-armata",
  subsets: ["latin"],
  weight: "400",
});

const audiowide = Audiowide({
  variable: "--font-audiowide",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "idlebrew",
  description: "AI-powered deck brewing for Magic: The Gathering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${armata.variable} ${audiowide.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <TopNav />
        {children}
        <Toaster theme="dark" />
        <SpeedInsights />
        <footer className="mt-auto border-t border-border py-4 px-6">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="/data-deletion" className="hover:text-foreground transition-colors">Data Deletion</a>
            <a href="/feedback" className="hover:text-foreground transition-colors">Feedback</a>
          </nav>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
