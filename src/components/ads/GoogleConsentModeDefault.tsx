import Script from 'next/script'

/**
 * Optional Consent Mode v2 defaults (denied) before any ad or analytics tags.
 * Enable with NEXT_PUBLIC_GOOGLE_CONSENT_MODE_V2=1 when a consent UI updates
 * gtag('consent','update',…) for EEA/UK traffic (issue #208 / counsel).
 *
 * Uses `afterInteractive` (App Router cannot use `beforeInteractive` outside
 * `pages/_document`). This component is rendered before `AdSenseLayout` in
 * `layout.tsx` so the consent snippet runs first among client scripts.
 */
export function GoogleConsentModeDefault() {
  if (process.env.NEXT_PUBLIC_GOOGLE_CONSENT_MODE_V2 !== '1') {
    return null
  }

  return (
    <Script
      id="google-consent-mode-default"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied'
});
`,
      }}
    />
  )
}
