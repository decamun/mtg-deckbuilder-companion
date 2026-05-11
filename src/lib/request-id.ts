/** Prefer inbound x-request-id (edge/proxy) for log correlation. */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim()
  return incoming || crypto.randomUUID()
}
