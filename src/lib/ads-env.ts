/**
 * Google AdSense wiring (issue #215). Publisher and slot ids are public once
 * served; we still gate loading so local dev does not hit the live network
 * unless explicitly opted in.
 */
export function areAdSensePublicEnvVarsPresent(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID?.trim() &&
      process.env.NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT_ID?.trim()
  )
}

/** Client and server: whether this build should request AdSense assets. */
export function shouldServeAdSense(): boolean {
  if (!areAdSensePublicEnvVarsPresent()) return false
  if (process.env.NODE_ENV === 'production') return true
  return process.env.NEXT_PUBLIC_ADSENSE_ALLOW_IN_DEV === '1'
}
