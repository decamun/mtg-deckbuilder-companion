export function formatPrice(usd: number | string | null | undefined): string {
  if (usd == null || usd === "") return "—"
  const n = typeof usd === "string" ? parseFloat(usd) : usd
  if (Number.isNaN(n)) return "—"
  if (n >= 100) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

export function pickPrice(
  prices: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null } | undefined,
  finish: "nonfoil" | "foil" | "etched"
): number | null {
  if (!prices) return null
  const raw =
    finish === "foil" ? prices.usd_foil :
    finish === "etched" ? prices.usd_etched :
    prices.usd
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isNaN(n) ? null : n
}
