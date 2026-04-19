import type { Metadata } from "next";
import { Armata, Audiowide } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

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
  title: "Nexus Deckbuilder",
  description: "Next-gen MTG companion powered by AI",
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
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
