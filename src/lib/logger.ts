/**
 * Minimal structured logger for API routes.
 *
 * Emits newline-delimited JSON to stdout/stderr so log aggregators (Vercel,
 * Railway, Render, etc.) can ingest structured fields without regex parsing.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.error('db query failed', { requestId, userId, error: err.message })
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  [key: string]: unknown
}

function emit(level: Level, message: string, ctx?: LogContext): void {
  const entry = {
    level,
    ts: new Date().toISOString(),
    msg: message,
    ...ctx,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  debug: (message: string, ctx?: LogContext) => emit('debug', message, ctx),
  info: (message: string, ctx?: LogContext) => emit('info', message, ctx),
  warn: (message: string, ctx?: LogContext) => emit('warn', message, ctx),
  error: (message: string, ctx?: LogContext) => emit('error', message, ctx),
}
