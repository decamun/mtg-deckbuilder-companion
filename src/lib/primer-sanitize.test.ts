import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadPrimerSanitize(envValue?: string) {
  vi.resetModules()
  vi.unstubAllEnvs()
  if (envValue !== undefined) {
    vi.stubEnv('NEXT_PUBLIC_IDLEBREW_HOSTS', envValue)
  }
  return import('@/lib/primer-sanitize')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('isAllowedPrimerUrl', () => {
  it('allows default idlebrew and vercel preview hosts when the env override is unset', async () => {
    const { isAllowedPrimerUrl } = await loadPrimerSanitize()

    expect(isAllowedPrimerUrl('https://idlebrew.app/primer')).toBe(true)
    expect(isAllowedPrimerUrl('https://www.idlebrew.app/primer')).toBe(true)
    expect(isAllowedPrimerUrl('https://preview-123.decamuns-projects.vercel.app/primer')).toBe(true)
    expect(isAllowedPrimerUrl('https://decamuns-projects.vercel.app/primer')).toBe(false)
    expect(isAllowedPrimerUrl('https://evilidlebrew.app/primer')).toBe(false)
    expect(isAllowedPrimerUrl('javascript:alert(1)')).toBe(false)
  })

  it('uses the custom allowlist env and supports wildcard suffix matching', async () => {
    const { allowedHostsForDisplay, isAllowedPrimerUrl } = await loadPrimerSanitize(
      'example.com, *.example.org',
    )

    expect(allowedHostsForDisplay()).toBe('example.com, *.example.org')
    expect(isAllowedPrimerUrl('https://example.com/path')).toBe(true)
    expect(isAllowedPrimerUrl('https://docs.example.org/primer')).toBe(true)
    expect(isAllowedPrimerUrl('https://example.org/primer')).toBe(false)
    expect(isAllowedPrimerUrl('https://other.com/primer')).toBe(false)
  })
})
