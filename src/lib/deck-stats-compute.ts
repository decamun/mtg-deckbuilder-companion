/**
 * Pure deck analytics + format validation summaries shared by the deck editor UI,
 * MCP tools, and the in-app agent.
 */

import { primaryTypeLine } from '@/lib/card-types'
import type { DeckRow } from '@/lib/deck-service'
import {
  isFormatValidationImplemented,
  normalizeFormatForValidation,
  validateDeckForFormat,
  type FormatValidationCard,
} from '@/lib/deck-format-validation'

/** Card shape for analytics + Commander format hints (matches hydrated deck rows). */
export interface DeckStatsCard {
  id: string
  scryfall_id: string
  oracle_id?: string | null
  name: string
  quantity: number
  zone?: string
  type_line?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  image_url?: string
  oracle_text?: string
  produced_mana?: string[]
  tags?: string[]
  color_identity?: string[]
  legalities?: Record<string, string>
  price_usd?: number | null
}

export const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
export type CurveColorKey = (typeof COLOR_KEYS)[number]

export const TYPE_PRIORITY = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
] as const
export type DeckStatCardType = (typeof TYPE_PRIORITY)[number]

export const PROB_TURNS = [1, 2, 3, 4, 5, 6, 7] as const

export const SPIDER_COLOR_KEYS = ['W', 'U', 'B', 'R', 'G'] as const
export type SpiderColor = (typeof SPIDER_COLOR_KEYS)[number]

const RAMP_TAGS = ['ramp', 'mana ramp', 'mana acceleration', 'acceleration']
const DRAW_TAGS = ['draw', 'card draw', 'card advantage', 'cantrip']

export function getDeckStatCardType(typeLine: string): DeckStatCardType {
  const primary = primaryTypeLine(typeLine)
  for (const t of TYPE_PRIORITY) {
    if (primary.includes(t)) return t
  }
  return 'Creature'
}

export function isLandTypeLine(typeLine: string | undefined): boolean {
  return !!typeLine && primaryTypeLine(typeLine).includes('Land')
}

function isBasicLand(typeLine: string | undefined): boolean {
  return !!typeLine && primaryTypeLine(typeLine).includes('Basic') && primaryTypeLine(typeLine).includes('Land')
}

/** MDFCs where the front face is NOT a land but the back face IS (e.g. "Sorcery // Land") */
function isMdfcWithLandBack(typeLine: string | undefined): boolean {
  if (!typeLine) return false
  const sep = typeLine.indexOf(' // ')
  if (sep === -1) return false
  const front = typeLine.slice(0, sep)
  const back = typeLine.slice(sep + 4)
  return !front.includes('Land') && back.includes('Land')
}

/** Land-type cards plus MDFC spell faces with a land back (matches Lands badge / hypergeom K). */
export function countLandSources(cards: DeckStatsCard[]): number {
  let n = 0
  for (const c of cards) {
    if (isLandTypeLine(c.type_line)) n += c.quantity
    else if (isMdfcWithLandBack(c.type_line)) n += c.quantity
  }
  return n
}

function hasDefinedCmc(c: DeckStatsCard): c is DeckStatsCard & { cmc: number } {
  return typeof c.cmc === 'number' && Number.isFinite(c.cmc)
}

function matchesRampTags(card: DeckStatsCard): boolean {
  const tags = card.tags
  if (!tags || tags.length === 0) return false
  for (const t of tags) {
    const low = t.toLowerCase()
    for (const n of RAMP_TAGS) {
      if (low === n || low.includes(n)) return true
    }
  }
  return false
}

function deckRampSpellsNumeric(cards: DeckStatsCard[]): DeckStatsCard[] {
  return cards.filter(c => !isLandTypeLine(c.type_line) && matchesRampTags(c) && hasDefinedCmc(c))
}

function rampQtyForMaxCmc(rampSp: DeckStatsCard[], maxCmc: number): number {
  return rampSp
    .filter((c): c is DeckStatsCard & { cmc: number } => hasDefinedCmc(c) && c.cmc <= maxCmc)
    .reduce((s, c) => s + c.quantity, 0)
}

function cardColors(c: DeckStatsCard): CurveColorKey[] {
  const cs = (c.colors || []).filter((x): x is CurveColorKey =>
    x === 'W' || x === 'U' || x === 'B' || x === 'R' || x === 'G'
  )
  return cs.length > 0 ? cs : ['C']
}

/** Hypergeometric probability: P(X >= k) where X ~ Hypergeometric(N, K, n) */
export function hypergeomAtLeast(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1
  const max = Math.min(K, n)
  if (k > max) return 0
  if (n > N) return 0
  let p = 1
  for (let i = 0; i < n; i++) {
    const num = N - K - i
    const den = N - i
    if (den <= 0) return 0
    p *= num <= 0 ? 0 : num / den
  }
  let cumulative = 0
  for (let i = 0; i <= max; i++) {
    if (i >= k) cumulative += p
    if (i < max) {
      const denom = (i + 1) * (N - K - n + i + 1)
      if (denom <= 0) {
        p = 0
      } else {
        p = (p * (K - i) * (n - i)) / denom
      }
    }
  }
  return cumulative
}

/**
 * E[min(X, cap)] for X ~ Hypergeometric(N, K, n).
 * Sum_k min(k,cap) * P(X=k) via the same PMF recurrence as hypergeomAtLeast.
 */
export function hypergeomExpectedMin(N: number, K: number, n: number, cap: number): number {
  if (cap <= 0 || N <= 0 || n <= 0 || K <= 0) return 0
  const nEff = Math.min(n, N)
  const kMin = Math.max(0, nEff + K - N)
  const kMax = Math.min(nEff, K)
  if (kMin > kMax) return 0

  let p = 1
  for (let i = 0; i < nEff; i++) {
    const den = N - i
    if (den <= 0) return 0
    p *= (N - K - i) / den
  }

  for (let k = 0; k < kMin; k++) {
    const denom = (k + 1) * (N - K - nEff + k + 1)
    if (denom <= 0) return 0
    p = (p * (K - k) * (nEff - k)) / denom
  }

  let expected = 0
  for (let k = kMin; k <= kMax; k++) {
    expected += Math.min(k, cap) * p
    if (k < kMax) {
      const denom = (k + 1) * (N - K - nEff + k + 1)
      if (denom <= 0) break
      p = (p * (K - k) * (nEff - k)) / denom
    }
  }
  return expected
}
/**
 * P(min(L,capL) + min(R,capR) >= need) for one random ordering of the deck:
 * - L = land sources among the first nT cards
 * - R = eligible ramp among the first nPrev cards (nPrev <= nT)
 * Deck splits into K_L land sources, K_R ramp copies, K_O = N - K_L - K_R other.
 */
export function probCappedLandRampGteCmc(
  N: number,
  K_L: number,
  K_R: number,
  nT: number,
  nPrev: number,
  capL: number,
  capR: number,
  need: number,
): number {
  if (need <= 0) return 1
  if (N <= 0) return 0
  const nTot = Math.min(Math.max(0, nT), N)
  const nPr = Math.min(Math.max(0, nPrev), nTot)
  const delta = nTot - nPr

  const kL = Math.min(Math.max(0, K_L), N)
  const kR = Math.min(Math.max(0, K_R), N - kL)
  const kO = N - kL - kR
  if (kO < 0) return 0

  const lf = new Float64Array(N + 1)
  lf[0] = 0
  for (let i = 1; i <= N; i++) lf[i] = lf[i - 1] + Math.log(i)

  const logChoose = (n: number, k: number) =>
    k < 0 || k > n ? -Infinity : lf[n] - lf[k] - lf[n - k]

  let sum = 0
  const l1Max = Math.min(nPr, kL)
  for (let l1 = 0; l1 <= l1Max; l1++) {
    const rMax = Math.min(nPr - l1, kR)
    for (let r = 0; r <= rMax; r++) {
      const o1 = nPr - l1 - r
      if (o1 < 0 || o1 > kO) continue
      const logP1 = logChoose(kL, l1) + logChoose(kR, r) + logChoose(kO, o1) - logChoose(N, nPr)
      if (!Number.isFinite(logP1) || logP1 < -700) continue
      const p1 = Math.exp(logP1)

      if (delta === 0) {
        const L = l1
        if (Math.min(L, capL) + Math.min(r, capR) >= need) sum += p1
        continue
      }

      const rem = N - nPr
      const kLRem = kL - l1
      const maxL2 = Math.min(delta, kLRem)
      for (let l2 = 0; l2 <= maxL2; l2++) {
        const logP2 =
          logChoose(kLRem, l2) + logChoose(rem - kLRem, delta - l2) - logChoose(rem, delta)
        if (!Number.isFinite(logP2) || logP2 < -700) continue
        const p2 = Math.exp(logP2)
        const L = l1 + l2
        if (Math.min(L, capL) + Math.min(r, capR) >= need) sum += p1 * p2
      }
    }
  }
  return Math.min(1, Math.max(0, sum))
}



export interface CurveCell {
  count: number
  normalized: number
  byType: Partial<Record<DeckStatCardType, number>>
}

export interface CurveData {
  grid: Record<CurveColorKey, Record<number, CurveCell>>
  cmcRange: number[]
  totalsByCmc: number[]
  maxColumnHeight: number
}

export function buildManaCurveData(cards: DeckStatsCard[]): CurveData {
  const nonLands = cards.filter(c => !isLandTypeLine(c.type_line))
  const maxCmc = Math.max(7, ...nonLands.map(c => Math.min(c.cmc || 0, 12)))
  const cmcRange = Array.from({ length: maxCmc + 1 }, (_, i) => i)

  const grid = {} as Record<CurveColorKey, Record<number, CurveCell>>
  for (const color of COLOR_KEYS) {
    grid[color] = {}
    for (const cmc of cmcRange) {
      grid[color][cmc] = { count: 0, normalized: 0, byType: {} }
    }
  }

  const totalsByCmc = new Array(cmcRange.length).fill(0)

  for (const c of nonLands) {
    const cmc = Math.min(c.cmc ?? 0, maxCmc)
    const colors = cardColors(c)
    const numColors = colors.length
    const t = getDeckStatCardType(c.type_line || '')
    totalsByCmc[cmc] += c.quantity
    for (const color of colors) {
      const cell = grid[color][cmc]
      cell.count += c.quantity
      cell.normalized += c.quantity / numColors
      cell.byType[t] = (cell.byType[t] || 0) + c.quantity
    }
  }

  const maxColumnHeight = Math.max(1, ...totalsByCmc)
  return { grid, cmcRange, totalsByCmc, maxColumnHeight }
}

export interface StatsLineSummary {
  avg_cmc_non_land: number
  avg_cmc_all_cards: number
  type_counts: Record<DeckStatCardType, number>
  lands: {
    /** Land-type quantity + MDFC spell // land (same as opening-hand hypergeom K). */
    total_display: number
    /** Quantity typed as Land excluding MDFC adjustment detail */
    land_type_quantity: number
    basic: number
    non_basic: number
    mdfc_with_land_back: number
  }
  commander_on_curve: Array<{ name: string; cmc: number; probability: number }>
}

export function computeStatsLineSummary(
  cards: DeckStatsCard[],
  commanders: DeckStatsCard[]
): StatsLineSummary {
  const nonLands = cards.filter(c => !isLandTypeLine(c.type_line))
  const totalNonLandQty = nonLands.reduce((s, c) => s + c.quantity, 0)
  const totalCmc = nonLands.reduce((s, c) => s + (c.cmc || 0) * c.quantity, 0)
  const avgCmcNonLand = totalNonLandQty > 0 ? totalCmc / totalNonLandQty : 0

  const totalAllQty = cards.reduce((s, c) => s + c.quantity, 0)
  const totalAllCmc = cards.reduce((s, c) => s + (c.cmc || 0) * c.quantity, 0)
  const avgCmcAll = totalAllQty > 0 ? totalAllCmc / totalAllQty : 0

  const typeCounts = {
    Creature: 0,
    Planeswalker: 0,
    Battle: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Land: 0,
  } as Record<DeckStatCardType, number>
  for (const c of cards) {
    const t = getDeckStatCardType(c.type_line || '')
    typeCounts[t] += c.quantity
  }

  const deckSize = cards.reduce((s, c) => s + c.quantity, 0)
  const landSources = countLandSources(cards)

  const basicLandCount = cards
    .filter(c => isBasicLand(c.type_line))
    .reduce((s, c) => s + c.quantity, 0)

  const mdfcLandCount = cards
    .filter(c => isMdfcWithLandBack(c.type_line))
    .reduce((s, c) => s + c.quantity, 0)

  const rampSp = deckRampSpellsNumeric(cards)
  const onCurve = commanders.map(cmd => {
    const cmc = cmd.cmc ?? 0
    const nT = Math.max(0, Math.min(deckSize, 7 + cmc - 1))
    const nPrev = cmc >= 2 ? Math.max(0, Math.min(deckSize, 7 + cmc - 2)) : 0
    const kRamp = rampQtyForMaxCmc(rampSp, cmc - 1)
    const p = probCappedLandRampGteCmc(deckSize, landSources, kRamp, nT, nPrev, cmc, cmc - 1, cmc)
    return { name: cmd.name, cmc, probability: p }
  })

  return {
    avg_cmc_non_land: avgCmcNonLand,
    avg_cmc_all_cards: avgCmcAll,
    type_counts: typeCounts,
    lands: {
      total_display: landSources,
      land_type_quantity: typeCounts.Land,
      basic: basicLandCount,
      non_basic: typeCounts.Land - basicLandCount,
      mdfc_with_land_back: mdfcLandCount,
    },
    commander_on_curve: onCurve,
  }
}

export type ProbRowValueKind = 'probability' | 'expected_mana'

export type OpeningMeasureId =
  | 'land_drop'
  | 'land_drop_draw'
  | 'expected_mana'
  | 'cast_commander'

export interface ProbRow {
  label: string
  hint?: string
  valueKind: ProbRowValueKind
  measureId: OpeningMeasureId
  cells: (number | null)[]
}

function hasTagMatch(card: DeckStatsCard, needles: string[]): boolean {
  const tags = card.tags
  if (!tags || tags.length === 0) return false
  for (const t of tags) {
    const low = t.toLowerCase()
    for (const n of needles) {
      if (low === n || low.includes(n)) return true
    }
  }
  return false
}

const isRamp = (c: DeckStatsCard) => matchesRampTags(c)
const isDraw = (c: DeckStatsCard) => hasTagMatch(c, DRAW_TAGS)

export function buildProbabilityRows(
  cards: DeckStatsCard[],
  commanders: DeckStatsCard[]
): { rows: ProbRow[]; cardsSeen: number[]; deckSize: number; lands: number } {
  const deckSize = cards.reduce((s, c) => s + c.quantity, 0)
  const landSources = countLandSources(cards)

  const cardsSeen = PROB_TURNS.map(T => Math.min(deckSize, 7 + T - 1))

  const drawSpells = cards.filter(
    c => !isLandTypeLine(c.type_line) && isDraw(c) && hasDefinedCmc(c),
  )
  const rampSpells = cards.filter(
    c => !isLandTypeLine(c.type_line) && isRamp(c) && hasDefinedCmc(c),
  )

  const countByTurn = (pool: DeckStatsCard[]) => (T: number) =>
    pool.filter(c => hasDefinedCmc(c) && c.cmc <= T - 1).reduce((s, c) => s + c.quantity, 0)

  const drawCount = countByTurn(drawSpells)
  const rampQtyCastableBy = (maxCmc: number) =>
    rampSpells.filter(c => hasDefinedCmc(c) && c.cmc <= maxCmc).reduce((s, c) => s + c.quantity, 0)

  const hasDraw = drawSpells.length > 0

  const rows: ProbRow[] = []

  rows.push({
    label: 'Land drop',
    valueKind: 'probability',
    measureId: 'land_drop',
    hint: `${landSources} land sources`,
    cells: PROB_TURNS.map((T, i) => {
      if (T > deckSize) return null
      return hypergeomAtLeast(deckSize, landSources, cardsSeen[i], T)
    }),
  })

  if (hasDraw) {
    rows.push({
      label: 'Land drop',
      valueKind: 'probability',
      measureId: 'land_drop_draw',
      hint: 'with draw',
      cells: PROB_TURNS.map((T, i) => {
        const seen = Math.min(deckSize, cardsSeen[i] + drawCount(T))
        return hypergeomAtLeast(deckSize, landSources, seen, T)
      }),
    })
  }

  rows.push({
    label: 'Expected mana',
    valueKind: 'expected_mana',
    measureId: 'expected_mana',
    hint: 'E[min(lands,T)]+E[min(ramp,T-1)] generic',
    cells: PROB_TURNS.map((T, i) => {
      if (T > deckSize) return null
      const nLand = cardsSeen[i]
      const landPart = hypergeomExpectedMin(deckSize, landSources, nLand, T)
      let rampPart = 0
      if (T >= 2) {
        const nRamp = cardsSeen[T - 2]
        const kRamp = rampQtyCastableBy(T - 1)
        rampPart = hypergeomExpectedMin(deckSize, kRamp, nRamp, T - 1)
      }
      return landPart + rampPart
    }),
  })

  for (const cmd of commanders) {
    const cmc = cmd.cmc ?? 0
    if (cmc <= 0) continue

    rows.push({
      label: `Cast ${cmd.name}`,
      valueKind: 'probability',
      measureId: 'cast_commander',
      hint: `CMC ${cmc} · capped land+ramp`,
      cells: PROB_TURNS.map((T, i) => {
        const nT = cardsSeen[i]
        const nPrev = T >= 2 ? cardsSeen[T - 2] : 0
        const kRamp = rampQtyCastableBy(T - 1)
        return probCappedLandRampGteCmc(deckSize, landSources, kRamp, nT, nPrev, T, T - 1, cmc)
      }),
    })
  }

  return { rows, cardsSeen, deckSize, lands: landSources }
}

export interface SpiderTotals {
  production: Record<SpiderColor, number>
  productionLands: Record<SpiderColor, number>
  productionNonLands: Record<SpiderColor, number>
  pips: Record<SpiderColor, number>
}

function parsePips(manaCost: string | undefined): Record<SpiderColor, number> {
  const out: Record<SpiderColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  if (!manaCost) return out
  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  for (const raw of symbols) {
    const inner = raw.slice(1, -1).toUpperCase()
    if (/^[0-9]+$/.test(inner) || inner === 'X' || inner === 'C' || inner === 'S') continue
    const parts = inner.split('/').filter(p => p.length > 0)
    const colorParts = parts.filter(p => /^[WUBRG]$/.test(p))
    if (colorParts.length === 0) continue
    const weight = 1 / colorParts.length
    for (const p of colorParts) out[p as SpiderColor] += weight
  }
  return out
}

function inferProducedFromText(text: string | undefined): SpiderColor[] {
  if (!text) return []
  const out = new Set<SpiderColor>()
  const re = /add\s+([^.]*?)(?:\.|$)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const segment = m[1]
    const symbols = segment.match(/\{([^}]+)\}/g) || []
    for (const raw of symbols) {
      const inner = raw.slice(1, -1).toUpperCase()
      const parts = inner.split('/')
      for (const p of parts) {
        if (p === 'W' || p === 'U' || p === 'B' || p === 'R' || p === 'G') {
          out.add(p)
        }
      }
    }
  }
  return Array.from(out)
}

export function buildSpiderTotals(cards: DeckStatsCard[]): SpiderTotals {
  const empty = (): Record<SpiderColor, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0 })

  const productionLands = empty()
  const productionNonLands = empty()
  const pips = empty()

  for (const c of cards) {
    const q = c.quantity
    let produced = (c.produced_mana || []).filter(
      (x): x is SpiderColor => x === 'W' || x === 'U' || x === 'B' || x === 'R' || x === 'G'
    )
    if (produced.length === 0) {
      produced = inferProducedFromText(c.oracle_text)
    }

    const land = isLandTypeLine(c.type_line)
    const bucket = land ? productionLands : productionNonLands
    for (const color of produced) bucket[color] += q

    if (!land) {
      const cardPips = parsePips(c.mana_cost)
      for (const color of SPIDER_COLOR_KEYS) pips[color] += cardPips[color] * q
    }
  }

  const production = empty()
  for (const color of SPIDER_COLOR_KEYS) {
    production[color] = productionLands[color] + productionNonLands[color]
  }

  return { production, productionLands, productionNonLands, pips }
}

function asValidationCards(cards: DeckStatsCard[]): FormatValidationCard[] {
  return cards.map((c) => ({
    id: c.id,
    scryfall_id: c.scryfall_id,
    oracle_id: c.oracle_id ?? null,
    name: c.name,
    quantity: c.quantity,
    zone: c.zone ?? 'mainboard',
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    color_identity: c.color_identity,
    legalities: c.legalities,
  }))
}

export interface DeckStatsReport {
  deck_id: string
  deck_name: string
  format: string | null
  format_normalized: string | null
  bracket: number | null
  commander_scryfall_ids: string[]
  counts: {
    total_card_quantity: number
    unique_entries: number
    /** Same scope as the Analytics tab mainboard column (excludes commander-designated cards). */
    mainboard_quantity: number
    commander_card_quantity: number
  }
  price_usd: {
    sum: number
    any_missing_price: boolean
    rows_missing_price: number
  }
  format_validation: {
    validation_implemented: boolean
    violation_card_count: number
    violations: Array<{
      deck_card_id: string
      name: string
      quantity: number
      scryfall_id: string
      reasons: readonly string[]
    }>
  }
  analytics: {
    stats_line: StatsLineSummary
    mana_curve: CurveData
    opening_probabilities: ReturnType<typeof buildProbabilityRows>
    color_balance: SpiderTotals
  }
}

export function computeDeckStatsReport(deck: DeckRow, allCards: DeckStatsCard[]): DeckStatsReport {
  const commanderIds = deck.commander_scryfall_ids ?? []
  const mainboard = allCards.filter(c => !commanderIds.includes(c.scryfall_id))
  const commanders = allCards.filter(c => commanderIds.includes(c.scryfall_id))

  let sumPrice = 0
  let rowsMissingPrice = 0
  for (const c of allCards) {
    if (c.price_usd == null) rowsMissingPrice++
    else sumPrice += c.price_usd * c.quantity
  }

  const totalQty = allCards.reduce((s, c) => s + c.quantity, 0)

  const { violationsByCardId } = validateDeckForFormat(deck.format, {
    cards: asValidationCards(allCards),
    commanderScryfallIds: commanderIds,
    bracket: deck.bracket ?? null,
  })

  const violations = [...violationsByCardId.entries()]
    .filter(([, reasons]) => reasons.length > 0)
    .map(([id, reasons]) => {
      const row = allCards.find(x => x.id === id)
      return {
        deck_card_id: id,
        name: row?.name ?? '?',
        quantity: row?.quantity ?? 0,
        scryfall_id: row?.scryfall_id ?? '',
        reasons,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    deck_id: deck.id,
    deck_name: deck.name,
    format: deck.format,
    format_normalized: normalizeFormatForValidation(deck.format),
    bracket: deck.bracket ?? null,
    commander_scryfall_ids: [...commanderIds],
    counts: {
      total_card_quantity: totalQty,
      unique_entries: allCards.length,
      mainboard_quantity: mainboard.reduce((s, c) => s + c.quantity, 0),
      commander_card_quantity: commanders.reduce((s, c) => s + c.quantity, 0),
    },
    price_usd: {
      sum: sumPrice,
      any_missing_price: rowsMissingPrice > 0,
      rows_missing_price: rowsMissingPrice,
    },
    format_validation: {
      validation_implemented: isFormatValidationImplemented(deck.format),
      violation_card_count: violations.length,
      violations,
    },
    analytics: {
      stats_line: computeStatsLineSummary(mainboard, commanders),
      mana_curve: buildManaCurveData(mainboard),
      opening_probabilities: buildProbabilityRows(mainboard, commanders),
      color_balance: buildSpiderTotals(mainboard),
    },
  }
}
