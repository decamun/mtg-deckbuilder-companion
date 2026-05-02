const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/

export function isValidEdhrecSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.includes("--")
}
