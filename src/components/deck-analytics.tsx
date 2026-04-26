"use client"

import { useEffect, useMemo, useState } from "react"
import { Shuffle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface AnalyticsCard {
  id: string
  scryfall_id: string
  name: string
  quantity: number
  type_line?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  image_url?: string
}

const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
type ColorKey = typeof COLOR_KEYS[number]

const COLOR_META: Record<ColorKey, { name: string; fill: string; text: string }> = {
  W: { name: 'White',     fill: '#f8efcf', text: '#3a2f10' },
  U: { name: 'Blue',      fill: '#3b7dd8', text: '#ffffff' },
  B: { name: 'Black',     fill: '#2b2b2b', text: '#ffffff' },
  R: { name: 'Red',       fill: '#d44545', text: '#ffffff' },
  G: { name: 'Green',     fill: '#3d9a5a', text: '#ffffff' },
  C: { name: 'Colorless', fill: '#a8a29e', text: '#1c1917' },
}

const TYPE_PRIORITY = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
] as const
type CardType = typeof TYPE_PRIORITY[number]

function getCardType(typeLine: string): CardType {
  for (const t of TYPE_PRIORITY) {
    if (typeLine.includes(t)) return t
  }
  return 'Creature'
}

function isLand(typeLine: string | undefined): boolean {
  return !!typeLine && typeLine.includes('Land')
}

function cardColors(c: AnalyticsCard): ColorKey[] {
  const cs = (c.colors || []).filter((x): x is ColorKey =>
    x === 'W' || x === 'U' || x === 'B' || x === 'R' || x === 'G'
  )
  return cs.length > 0 ? cs : ['C']
}

// ── Hypergeometric probability: P(X >= k) where X ~ Hypergeometric(N, K, n) ──
function hypergeomAtLeast(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1
  const max = Math.min(K, n)
  if (k > max) return 0
  if (n > N) return 0
  // P(X=0) = product i=0..n-1 of (N-K-i) / (N-i)
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

// ──────────────────────────── Mana curve ────────────────────────────

interface CurveCell {
  count: number              // raw card count (sum of quantities) in this color × cmc
  normalized: number         // normalized contribution (multicolor cards split)
  byType: Partial<Record<CardType, number>>
}

interface CurveData {
  grid: Record<ColorKey, Record<number, CurveCell>>
  cmcRange: number[]
  totalsByCmc: number[]      // raw totals per CMC bucket
  maxColumnHeight: number
}

function buildCurve(cards: AnalyticsCard[]): CurveData {
  const nonLands = cards.filter(c => !isLand(c.type_line))
  const maxCmc = Math.max(7, ...nonLands.map(c => Math.min(c.cmc || 0, 12)))
  const cmcRange = Array.from({ length: maxCmc + 1 }, (_, i) => i)

  const grid = {} as Record<ColorKey, Record<number, CurveCell>>
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
    const t = getCardType(c.type_line || '')
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

interface HoverState { color: ColorKey; cmc: number }

function ManaCurve({ cards }: { cards: AnalyticsCard[] }) {
  const data = useMemo(() => buildCurve(cards), [cards])
  const [hover, setHover] = useState<HoverState | null>(null)

  const chartHeight = 220
  const hasAnyCards = data.totalsByCmc.some(t => t > 0)

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-heading text-base tracking-wider">Mana Curve</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {COLOR_KEYS.map(c => (
            <div key={c} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-black/20"
                style={{ backgroundColor: COLOR_META[c].fill }}
              />
              <span>{COLOR_META[c].name}</span>
            </div>
          ))}
        </div>
      </div>

      {!hasAnyCards ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Add some non-land cards to see the curve.
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-2 px-2" style={{ height: chartHeight }}>
            {data.cmcRange.map(cmc => {
              const total = data.totalsByCmc[cmc]
              const colHeightPx = (total / data.maxColumnHeight) * chartHeight
              return (
                <div
                  key={cmc}
                  className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                >
                  <div className="text-[10px] text-muted-foreground mb-1 tabular-nums">
                    {total > 0 ? total : ''}
                  </div>
                  <div
                    className="w-full max-w-[44px] flex flex-col-reverse rounded-t-sm overflow-hidden border border-border/60"
                    style={{ height: colHeightPx, minHeight: total > 0 ? 2 : 0 }}
                  >
                    {COLOR_KEYS.map(color => {
                      const cell = data.grid[color][cmc]
                      if (cell.normalized <= 0) return null
                      const pct = (cell.normalized / total) * 100
                      const active = hover?.color === color && hover?.cmc === cmc
                      return (
                        <div
                          key={color}
                          className="w-full cursor-pointer transition-opacity"
                          style={{
                            height: `${pct}%`,
                            backgroundColor: COLOR_META[color].fill,
                            opacity: hover && !active ? 0.55 : 1,
                          }}
                          onMouseEnter={() => setHover({ color, cmc })}
                          onMouseLeave={() => setHover(null)}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 px-2 mt-1">
            {data.cmcRange.map(cmc => (
              <div key={cmc} className="flex-1 text-center text-xs text-muted-foreground tabular-nums">
                {cmc}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-1">
            Mana value (lands excluded; multicolor split across colors)
          </div>

          {hover && <CurveTooltip hover={hover} data={data} />}
        </div>
      )}
    </div>
  )
}

function CurveTooltip({ hover, data }: { hover: HoverState; data: CurveData }) {
  const cell = data.grid[hover.color][hover.cmc]
  const meta = COLOR_META[hover.color]
  const types = TYPE_PRIORITY.filter(t => (cell.byType[t] || 0) > 0)
  return (
    <div className="absolute top-0 right-0 bg-popover border border-border rounded-md shadow-lg p-3 text-xs min-w-[180px] pointer-events-none z-10">
      <div className="flex items-center gap-2 font-semibold mb-1.5">
        <span
          className="inline-block w-3 h-3 rounded-sm border border-black/20"
          style={{ backgroundColor: meta.fill }}
        />
        <span>{meta.name} · CMC {hover.cmc}</span>
      </div>
      <div className="text-muted-foreground mb-2">
        {cell.count} card{cell.count === 1 ? '' : 's'} total
        {cell.normalized !== cell.count && (
          <span className="ml-1">({cell.normalized.toFixed(1)} normalized)</span>
        )}
      </div>
      {types.length === 0 ? (
        <div className="text-muted-foreground italic">No cards.</div>
      ) : (
        <ul className="space-y-0.5">
          {types.map(t => (
            <li key={t} className="flex justify-between gap-4">
              <span>{t}{(cell.byType[t] || 0) > 1 ? 's' : ''}</span>
              <span className="tabular-nums">{cell.byType[t]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ──────────────────────────── Stats line ────────────────────────────

function StatsLine({
  cards,
  commanders,
}: {
  cards: AnalyticsCard[]
  commanders: AnalyticsCard[]
}) {
  const stats = useMemo(() => {
    const nonLands = cards.filter(c => !isLand(c.type_line))
    const totalNonLandQty = nonLands.reduce((s, c) => s + c.quantity, 0)
    const totalCmc = nonLands.reduce((s, c) => s + (c.cmc || 0) * c.quantity, 0)
    const avgCmc = totalNonLandQty > 0 ? totalCmc / totalNonLandQty : 0

    const typeCounts: Record<CardType, number> = {
      Creature: 0, Planeswalker: 0, Battle: 0, Instant: 0,
      Sorcery: 0, Artifact: 0, Enchantment: 0, Land: 0,
    }
    for (const c of cards) {
      const t = getCardType(c.type_line || '')
      typeCounts[t] += c.quantity
    }

    const deckSize = cards.reduce((s, c) => s + c.quantity, 0)
    const lands = typeCounts.Land

    const onCurve = commanders.map(cmd => {
      const cmc = cmd.cmc ?? 0
      // Cards seen by turn `cmc` going first: opening 7 + (cmc - 1) draws.
      const cardsSeen = Math.max(0, Math.min(deckSize, 6 + cmc))
      const p = hypergeomAtLeast(deckSize, lands, cardsSeen, cmc)
      return { name: cmd.name, cmc, probability: p }
    })

    return { avgCmc, typeCounts, onCurve }
  }, [cards, commanders])

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 flex flex-wrap items-stretch gap-x-6 gap-y-3">
      <Stat label="Avg. CMC" value={stats.avgCmc.toFixed(2)} hint="non-land" />
      {(Object.keys(stats.typeCounts) as CardType[])
        .filter(t => stats.typeCounts[t] > 0)
        .map(t => (
          <Stat key={t} label={t === 'Sorcery' ? 'Sorceries' : `${t}s`} value={String(stats.typeCounts[t])} />
        ))}
      {stats.onCurve.length > 0 && (
        <div className="flex flex-col justify-center min-w-[180px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Commander on curve
          </div>
          {stats.onCurve.map(c => (
            <div key={c.name} className="text-sm flex items-baseline gap-2">
              <span className="tabular-nums font-semibold">
                {(c.probability * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground truncate" title={c.name}>
                T{c.cmc} · {c.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col justify-center min-w-[64px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-muted-foreground/70 normal-case">({hint})</span>}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ──────────────────────────── Hand generator ────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function HandGenerator({ cards }: { cards: AnalyticsCard[] }) {
  const library = useMemo(() => {
    const out: AnalyticsCard[] = []
    for (const c of cards) {
      for (let i = 0; i < c.quantity; i++) out.push(c)
    }
    return out
  }, [cards])

  const [drawn, setDrawn] = useState<AnalyticsCard[]>([])
  const [deck, setDeck] = useState<AnalyticsCard[]>([])
  const [initialized, setInitialized] = useState(false)

  // Auto-shuffle once when cards finish loading. After that, the user controls
  // reshuffles manually so adding/removing a card mid-test doesn't wipe their hand.
  useEffect(() => {
    if (!initialized && library.length > 0) {
      const s = shuffle(library)
      setDrawn(s.slice(0, 7))
      setDeck(s.slice(7))
      setInitialized(true)
    }
  }, [library, initialized])

  const reshuffle = () => {
    const s = shuffle(library)
    setDrawn(s.slice(0, 7))
    setDeck(s.slice(7))
  }

  const drawOne = () => {
    if (deck.length === 0) return
    setDrawn(d => [...d, deck[0]])
    setDeck(d => d.slice(1))
  }

  if (library.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <h3 className="font-heading text-base tracking-wider mb-2">Sample Hand</h3>
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
          Add cards to draw a sample hand.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-heading text-base tracking-wider">Sample Hand</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {drawn.length} drawn · {deck.length} in library
          </span>
          <Button variant="outline" size="sm" onClick={drawOne} disabled={deck.length === 0}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Draw
          </Button>
          <Button size="sm" onClick={reshuffle}>
            <Shuffle className="w-3.5 h-3.5 mr-1" /> New Hand
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
        {drawn.map((c, idx) => (
          <div
            key={`${c.id}-${idx}`}
            className="relative aspect-[5/7] rounded-lg overflow-hidden border border-border shadow-md bg-muted"
            title={c.name}
          >
            {c.image_url ? (
              <img src={c.image_url} className="w-full h-full object-cover" alt={c.name} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center text-muted-foreground">
                {c.name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────── Top-level ────────────────────────────

export function DeckAnalytics({
  cards,
  commanders,
}: {
  cards: AnalyticsCard[]
  commanders: AnalyticsCard[]
}) {
  return (
    <div className="space-y-6">
      <StatsLine cards={cards} commanders={commanders} />
      <ManaCurve cards={cards} />
      <HandGenerator cards={cards} />
    </div>
  )
}

