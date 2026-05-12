import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkFixedWindowRateLimit,
  checkRateLimit,
  resetRateLimitsForTests,
} from '@/lib/rate-limit'

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitsForTests()
  })

  it('enforces fixed-window limits and exposes retry-after', () => {
    const now = 1_000
    expect(checkFixedWindowRateLimit('k1', 2, 10_000, now)).toEqual({
      ok: true,
      retryAfter: 10,
    })
    expect(checkFixedWindowRateLimit('k1', 2, 10_000, now + 1_000).ok).toBe(true)
    const blocked = checkFixedWindowRateLimit('k1', 2, 10_000, now + 2_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBe(8)
  })

  it('resetRateLimitsForTests clears counters', () => {
    checkRateLimit('k2', { maxRequests: 1, windowMs: 60_000 })
    expect(checkRateLimit('k2', { maxRequests: 1, windowMs: 60_000 }).ok).toBe(false)
    resetRateLimitsForTests()
    expect(checkRateLimit('k2', { maxRequests: 1, windowMs: 60_000 }).ok).toBe(true)
  })
})
