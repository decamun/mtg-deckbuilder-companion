'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { shouldServeAdSense } from '@/lib/ads-env'

type AdsPolicy = { showAds: boolean }

function AdSenseBannerUnit({
  publisherId,
  slotId,
  pathname,
}: {
  publisherId: string
  slotId: string
  pathname: string
}) {
  useEffect(() => {
    try {
      const w = window as Window & { adsbygoogle?: unknown[] }
      w.adsbygoogle = w.adsbygoogle || []
      w.adsbygoogle.push({})
    } catch {
      // Duplicate fill attempts (navigations, strict mode) are safe to ignore.
    }
  }, [pathname, publisherId, slotId])

  return (
    <ins
      key={pathname}
      className="adsbygoogle"
      style={{ display: 'block', minWidth: '320px', minHeight: '90px' }}
      data-ad-client={publisherId}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  )
}

/**
 * Owns script load + slot so unmounting clears `scriptReady` when ads are not shown.
 */
function AdSenseActiveBanner({
  publisherId,
  slotId,
  pathname,
}: {
  publisherId: string
  slotId: string
  pathname: string
}) {
  const [scriptReady, setScriptReady] = useState(false)
  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`

  return (
    <>
      <Script
        id="adsbygoogle-js"
        src={src}
        strategy="afterInteractive"
        crossOrigin="anonymous"
        onLoad={() => {
          setScriptReady(true)
        }}
      />
      <div
        className="border-b border-border bg-muted/20 print:hidden min-h-[92px]"
        aria-hidden
      >
        <div className="mx-auto flex w-full max-w-5xl justify-center px-4 py-2">
          {scriptReady ? (
            <AdSenseBannerUnit
              publisherId={publisherId}
              slotId={slotId}
              pathname={pathname}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}

/**
 * Top-of-content display slot: loads the AdSense script once, hides the slot
 * for idlebrew Pro, and re-pushes a unit on App Router client navigations.
 */
export function AdSenseLayout() {
  const pathname = usePathname()
  const configured = shouldServeAdSense()
  const [policy, setPolicy] = useState<AdsPolicy | null>(() =>
    configured ? null : { showAds: false }
  )
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID?.trim() ?? ''
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT_ID?.trim() ?? ''

  useEffect(() => {
    if (!configured) {
      return
    }

    let cancelled = false
    fetch('/api/ads-policy', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<AdsPolicy>
      })
      .then((body) => {
        if (!cancelled) setPolicy({ showAds: Boolean(body.showAds) })
      })
      .catch(() => {
        if (!cancelled) setPolicy({ showAds: false })
      })

    return () => {
      cancelled = true
    }
  }, [configured])

  if (!configured || policy === null || !policy.showAds) {
    return null
  }

  return (
    <AdSenseActiveBanner
      publisherId={publisherId}
      slotId={slotId}
      pathname={pathname}
    />
  )
}
