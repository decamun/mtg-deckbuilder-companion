declare module "next-pwa" {
  import type { NextConfig } from "next"

  interface NextPWAOptions {
    dest: string
    disable?: boolean
    register?: boolean
    skipWaiting?: boolean
  }

  export default function withPWA(
    options: NextPWAOptions
  ): (config: NextConfig) => NextConfig
}
