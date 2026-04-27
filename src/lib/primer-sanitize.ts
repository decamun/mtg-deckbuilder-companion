// Primer link allowlist. Production is idlebrew.app; preview deployments live
// at *.decamuns-projects.vercel.app. Override via NEXT_PUBLIC_IDLEBREW_HOSTS
// (comma-separated; entries beginning with "*." are wildcard-suffix matched).

const DEFAULT_HOSTS = ["idlebrew.app", "www.idlebrew.app", "*.decamuns-projects.vercel.app"]

function parseAllowedHosts(): { exact: Set<string>; suffixes: string[] } {
  const env = process.env.NEXT_PUBLIC_IDLEBREW_HOSTS
  const list = env
    ? env.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_HOSTS.map(s => s.toLowerCase())
  const exact = new Set<string>()
  const suffixes: string[] = []
  for (const entry of list) {
    if (entry.startsWith("*.")) suffixes.push(entry.slice(1))
    else exact.add(entry)
  }
  return { exact, suffixes }
}

const allowed = parseAllowedHosts()

export function isAllowedPrimerUrl(href: string): boolean {
  try {
    const u = new URL(href, "https://idlebrew.app")
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const host = u.host.toLowerCase()
    if (allowed.exact.has(host)) return true
    return allowed.suffixes.some(suffix => host.endsWith(suffix))
  } catch {
    return false
  }
}

export const allowedHostsForDisplay = () => {
  const env = process.env.NEXT_PUBLIC_IDLEBREW_HOSTS
  const raw = env ? env.split(",").map(s => s.trim()).filter(Boolean) : DEFAULT_HOSTS
  return raw.join(", ")
}
