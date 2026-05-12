import { Redis } from '@upstash/redis'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

let redisClient: Redis | null | undefined

/** Same logical keys share one counter when Upstash Redis is configured (preview/production). */
export function isDurableRateLimitEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) {
    redisClient = new Redis({ url, token })
  } else {
    redisClient = null
  }
  return redisClient
}

/**
 * When Upstash is unreachable or the script errors, we **fail open** (allow the
 * request): availability beats strict abuse control during infra outages. Logs
 * are emitted only when `DEBUG_RATE_LIMIT=1` to avoid noise in production.
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

for _ = 1, 12 do
  local cur = redis.call("GET", key)
  if cur == false then
    if redis.call("SET", key, "1", "PX", window, "NX") then
      return {1, math.max(1, math.ceil(window / 1000))}
    end
  else
    local n = tonumber(cur)
    if n >= limit then
      local pttl = redis.call("PTTL", key)
      if pttl <= 0 then
        redis.call("DEL", key)
      else
        return {0, math.max(1, math.ceil(pttl / 1000))}
      end
    else
      redis.call("INCR", key)
      local pttl = redis.call("PTTL", key)
      return {1, math.max(1, math.ceil(pttl / 1000))}
    end
  end
end
return {1, math.max(1, math.ceil(window / 1000))}
`

export interface RateLimitResult {
  ok: boolean
  retryAfter: number
}

export function checkFixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: Math.ceil(windowMs / 1000) }
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    ok: true,
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

function redisKey(logicalKey: string): string {
  return `rate:fw:v1:${logicalKey}`
}

async function checkFixedWindowRateLimitRedis(
  logicalKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = (await redis.eval(RATE_LIMIT_LUA, [redisKey(logicalKey)], [
      String(limit),
      String(windowMs),
    ])) as unknown
    if (!Array.isArray(raw) || raw.length < 2) return null
    const okFlag = Number(raw[0])
    const retryAfter = Number(raw[1])
    if (!Number.isFinite(okFlag) || !Number.isFinite(retryAfter)) return null
    return { ok: okFlag === 1, retryAfter: Math.max(1, Math.floor(retryAfter)) }
  } catch (e) {
    if (process.env.DEBUG_RATE_LIMIT === '1') {
      console.warn('[rate-limit] Redis error, failing open:', e)
    }
    return null
  }
}

/**
 * Fixed-window rate limit. Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set; otherwise an in-memory `Map` (local dev
 * and tests). Redis errors **fail open** (see module comment).
 */
export async function checkRateLimit(
  key: string,
  options: { maxRequests: number; windowMs: number }
): Promise<RateLimitResult> {
  if (isDurableRateLimitEnabled()) {
    const remote = await checkFixedWindowRateLimitRedis(
      key,
      options.maxRequests,
      options.windowMs
    )
    if (remote) return remote
    // Fail open without touching the in-memory map — falling back to a local
    // `Map` would defeat cross-instance limits during Redis outages.
    return { ok: true, retryAfter: Math.max(1, Math.ceil(options.windowMs / 1000)) }
  }
  return checkFixedWindowRateLimit(key, options.maxRequests, options.windowMs)
}

export function resetRateLimitsForTests() {
  buckets.clear()
  redisClient = undefined
}
