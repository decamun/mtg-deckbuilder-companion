import type { NextConfig } from "next";
import nextPWA from "next-pwa";

const isDev = process.env.NODE_ENV === "development";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "https://*.supabase.co";

const scriptSrc = ["'self'", "https://va.vercel-scripts.com"];
const styleSrc = ["'self'", "'unsafe-inline'"];
const connectSrc = [
  "'self'",
  supabaseOrigin,
  "https://*.supabase.co",
  "https://api.scryfall.com",
  "https://cards.scryfall.io",
  "https://vitals.vercel-insights.com",
  "https://va.vercel-scripts.com",
];

if (isDev) {
  scriptSrc.push("'unsafe-eval'");
  connectSrc.push("ws:", "http://localhost:*");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `script-src ${scriptSrc.join(" ")}`,
  `style-src ${styleSrc.join(" ")}`,
  "img-src 'self' data: blob: https://cards.scryfall.io https://*.scryfall.io",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const withPWA = nextPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

export default withPWA(nextConfig);
