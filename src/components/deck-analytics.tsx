"use client"

import { useMemo, useState } from "react"
import { Shuffle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ManaText } from "@/components/mana/ManaText"
import {
  buildManaCurveData,
  buildProbabilityRows,
  buildSpiderTotals,
  COLOR_KEYS,
  computeStatsLineSummary,
  PROB_TURNS,
  SPIDER_COLOR_KEYS,
  type CurveData,
  type DeckStatsCard,
  TYPE_PRIORITY,
} from "@/lib/deck-stats-compute"

export type { DeckStatsCard as AnalyticsCard } from "@/lib/deck-stats-compute"

const COLOR_META: Record<
  (typeof COLOR_KEYS)[number],
  { name: string; fill: string; text: string }
> = {
  W: { name: 'White',     fill: '#f8efcf', text: '#3a2f10' },
  U: { name: 'Blue',      fill: '#3b7dd8', text: '#ffffff' },
  B: { name: 'Black',     fill: '#2b2b2b', text: '#ffffff' },
  R: { name: 'Red',       fill: '#d44545', text: '#ffffff' },
  G: { name: 'Green',     fill: '#3d9a5a', text: '#ffffff' },
  C: { name: 'Colorless', fill: '#a8a29e', text: '#1c1917' },
}

type CardType = (typeof TYPE_PRIORITY)[number]

interface HoverState { color: (typeof COLOR_KEYS)[number]; cmc: number }

function ManaCurve({ cards }: { cards: DeckStatsCard[] }) {
  const data = useMemo(() => buildManaCurveData(cards), [cards])
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

function StatsLine({
  cards,
  commanders,
}: {
  cards: DeckStatsCard[]
  commanders: DeckStatsCard[]
}) {
  const stats = useMemo(() => computeStatsLineSummary(cards, commanders), [cards, commanders])

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 flex flex-wrap items-stretch gap-x-6 gap-y-3">
      <Stat label="Avg. CMC" value={stats.avg_cmc_all_cards.toFixed(2)} hint="all" />
      <Stat label="Avg. CMC" value={stats.avg_cmc_non_land.toFixed(2)} hint="non-land" />
      {(Object.keys(stats.type_counts) as CardType[])
        .filter(t => stats.type_counts[t] > 0 && t !== 'Land')
        .map(t => (
          <Stat key={t} label={t === 'Sorcery' ? 'Sorceries' : `${t}s`} value={String(stats.type_counts[t])} />
        ))}
      {stats.type_counts.Land > 0 && (
        <LandStat
          total={stats.lands.total_display}
          landsNoMdfc={stats.lands.land_type_quantity}
          basicLandCount={stats.lands.basic}
          mdfcLandCount={stats.lands.mdfc_with_land_back}
        />
      )}
      {stats.commander_on_curve.length > 0 && (
        <div className="flex flex-col justify-center min-w-[180px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Commander on curve
          </div>
          {stats.commander_on_curve.map(c => (
            <div key={c.name} className="text-sm flex items-baseline gap-2">
              <span className="tabular-nums font-semibold">
                {(c.probability * 100).toFixed(1)}%
              </span>
              <ManaText text={`T${c.cmc} · ${c.name}`} className="text-xs text-muted-foreground truncate" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LandStat({
  total,
  landsNoMdfc,
  basicLandCount,
  mdfcLandCount,
}: {
  total: number
  landsNoMdfc: number
  basicLandCount: number
  mdfcLandCount: number
}) {
  const hasDetail = basicLandCount > 0 || mdfcLandCount > 0
  return (
    <div className="group relative flex flex-col justify-center min-w-[64px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lands</div>
      <div className="text-lg font-semibold tabular-nums">{total}</div>
      {hasDetail && (
        <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-10 hidden group-hover:flex flex-col gap-1 rounded-md border border-border bg-popover px-3 py-2 shadow-md text-sm whitespace-nowrap">
          {basicLandCount > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Basic</span>
              <span className="tabular-nums font-medium">{basicLandCount}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Non-basic</span>
            <span className="tabular-nums font-medium">{landsNoMdfc - basicLandCount}</span>
          </div>
          {mdfcLandCount > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">MDFC</span>
              <span className="tabular-nums font-medium">{mdfcLandCount}</span>
            </div>
          )}
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

function probColor(p: number): string {
  if (p >= 0.9) return 'text-emerald-400'
  if (p >= 0.7) return 'text-emerald-300'
  if (p >= 0.5) return 'text-amber-300'
  if (p >= 0.25) return 'text-amber-400'
  return 'text-red-400'
}

function ProbabilityTable({
  cards,
  commanders,
}: {
  cards: DeckStatsCard[]
  commanders: DeckStatsCard[]
}) {
  const data = useMemo(
    () => buildProbabilityRows(cards, commanders),
    [cards, commanders],
  )

  if (data.deckSize === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <h3 className="font-heading text-base tracking-wider mb-2">Opening Probabilities</h3>
        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
          Add cards to compute probabilities.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-heading text-base tracking-wider">Opening Probabilities</h3>
        <span className="text-[10px] text-muted-foreground">
          Going first · {data.deckSize}-card deck · {data.lands} lands
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground border-b border-border/60">
              <th className="text-left font-normal py-1.5 pr-3">Turn</th>
              {PROB_TURNS.map((T, i) => (
                <th key={T} className="text-center font-normal py-1.5 px-2 min-w-[44px]">
                  <div className="text-foreground/80 font-semibold">{T}</div>
                  <div className="text-[10px] text-muted-foreground/80">
                    {data.cardsSeen[i]}c
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/30 last:border-0">
                <td className="py-1.5 pr-3">
                  <div className="font-medium truncate max-w-[200px]" title={row.label}>
                    {row.label}
                  </div>
                  {row.hint && (
                    <div className="text-[10px] text-muted-foreground">{row.hint}</div>
                  )}
                </td>
                {row.cells.map((p, i) => (
                  <td key={i} className="text-center py-1.5 px-2">
                    {p === null ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      <span className={`font-semibold ${probColor(p)}`}>
                        {(p * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Header shows turn number and cards seen by that turn.
        &ldquo;With draw&rdquo; treats each <span className="text-foreground/80">draw</span>-tagged spell
        castable by then as +1 card seen.
        &ldquo;With ramp (approx.)&rdquo; lowers the generic land count needed by at most one per prior turn
        (capped by ramp-tagged spells castable by then); it does not model colored pips, mana to cast ramp,
        or whether those spells were actually drawn.
      </div>
    </div>
  )
}

// SVG geometry for an N-axis spider centered at (cx, cy) with radius r.
function spiderPoint(cx: number, cy: number, r: number, axisIndex: number, axes: number, value: number, max: number) {
  const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / axes
  const ratio = max <= 0 ? 0 : Math.max(0, value / max)
  return {
    x: cx + Math.cos(angle) * r * ratio,
    y: cy + Math.sin(angle) * r * ratio,
    angle,
  }
}

function ColorSpider({ cards }: { cards: DeckStatsCard[] }) {
  const totals = useMemo(() => buildSpiderTotals(cards), [cards])

  const max = Math.max(
    1,
    ...SPIDER_COLOR_KEYS.map(c => totals.production[c]),
    ...SPIDER_COLOR_KEYS.map(c => totals.pips[c]),
  )

  const niceMax = Math.ceil(max / 5) * 5 || 5

  const cx = 110
  const cy = 110
  const radius = 80
  const axes = SPIDER_COLOR_KEYS.length
  const ringCount = 4

  const productionPoints = SPIDER_COLOR_KEYS.map((color, i) =>
    spiderPoint(cx, cy, radius, i, axes, totals.production[color], niceMax),
  )
  const pipPoints = SPIDER_COLOR_KEYS.map((color, i) =>
    spiderPoint(cx, cy, radius, i, axes, totals.pips[color], niceMax),
  )

  const productionPath = productionPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const pipPath = pipPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const rings = Array.from({ length: ringCount }, (_, k) => {
    const ringR = ((k + 1) / ringCount) * radius
    return SPIDER_COLOR_KEYS.map((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes
      return `${(cx + Math.cos(angle) * ringR).toFixed(1)},${(cy + Math.sin(angle) * ringR).toFixed(1)}`
    }).join(' ')
  })

  const hasAny = SPIDER_COLOR_KEYS.some(c => totals.production[c] > 0 || totals.pips[c] > 0)

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-heading text-base tracking-wider">Color Balance</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3d9a5a' }} />
            <span>Production</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#d44545' }} />
            <span>Pips on spells</span>
          </div>
        </div>
      </div>

      {!hasAny ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Add cards with mana costs and lands to see the balance.
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-4">
          <svg
            viewBox="0 0 220 220"
            className="w-full max-w-[260px] h-auto"
            role="img"
            aria-label="Color production vs spell pips spider chart"
          >
            {rings.map((points, i) => (
              <polygon
                key={i}
                points={points}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1}
                className="text-muted-foreground"
              />
            ))}

            {SPIDER_COLOR_KEYS.map((color, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes
              const ex = cx + Math.cos(angle) * radius
              const ey = cy + Math.sin(angle) * radius
              const lx = cx + Math.cos(angle) * (radius + 16)
              const ly = cy + Math.sin(angle) * (radius + 16)
              return (
                <g key={color}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={ex}
                    y2={ey}
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    className="text-muted-foreground"
                  />
                  <circle
                    cx={lx}
                    cy={ly}
                    r={9}
                    fill={COLOR_META[color].fill}
                    stroke="currentColor"
                    strokeOpacity={0.3}
                    className="text-border"
                  />
                  <text
                    x={lx}
                    y={ly}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={COLOR_META[color].text}
                  >
                    {color}
                  </text>
                </g>
              )
            })}

            <polygon
              points={productionPath}
              fill="#3d9a5a"
              fillOpacity={0.35}
              stroke="#3d9a5a"
              strokeWidth={1.5}
            />
            {productionPoints.map((p, i) => (
              <circle
                key={`prod-${i}`}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill="#3d9a5a"
              />
            ))}

            <polygon
              points={pipPath}
              fill="#d44545"
              fillOpacity={0.3}
              stroke="#d44545"
              strokeWidth={1.5}
            />
            {pipPoints.map((p, i) => (
              <circle
                key={`pip-${i}`}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill="#d44545"
              />
            ))}
          </svg>

          <div className="flex-1 min-w-0 w-full">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-muted-foreground border-b border-border/60">
                  <th className="text-left font-normal py-1">Color</th>
                  <th className="text-right font-normal py-1">Lands</th>
                  <th className="text-right font-normal py-1">Other</th>
                  <th className="text-right font-normal py-1">Total prod.</th>
                  <th className="text-right font-normal py-1">Pips</th>
                  <th className="text-right font-normal py-1">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {SPIDER_COLOR_KEYS.map(color => {
                  const total = totals.production[color]
                  const pip = totals.pips[color]
                  const ratio = pip > 0 ? total / pip : null
                  return (
                    <tr key={color} className="border-b border-border/30 last:border-0">
                      <td className="py-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-3 h-3 rounded-sm border border-black/20"
                            style={{ backgroundColor: COLOR_META[color].fill }}
                          />
                          <span>{COLOR_META[color].name}</span>
                        </div>
                      </td>
                      <td className="text-right py-1">{totals.productionLands[color]}</td>
                      <td className="text-right py-1">{totals.productionNonLands[color]}</td>
                      <td className="text-right py-1 font-semibold">{total}</td>
                      <td className="text-right py-1">{pip ? pip.toFixed(pip % 1 === 0 ? 0 : 1) : 0}</td>
                      <td className="text-right py-1">
                        {ratio === null ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          <span className={ratio >= 1 ? 'text-emerald-300' : 'text-amber-300'}>
                            {ratio.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Production counts each source per color it can produce (a dual land
              contributes to both axes). Hybrid pips are split evenly. Ratio &lt; 1
              means more demand than sources for that color.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function HandGenerator({ cards }: { cards: DeckStatsCard[] }) {
  const library = useMemo(() => {
    const out: DeckStatsCard[] = []
    for (const c of cards) {
      for (let i = 0; i < c.quantity; i++) out.push(c)
    }
    return out
  }, [cards])

  const initialHand = useMemo(() => {
    const s = shuffle(library)
    return {
      drawn: s.slice(0, 7),
      deck: s.slice(7),
    }
  }, [library])

  const [drawn, setDrawn] = useState<DeckStatsCard[]>(initialHand.drawn)
  const [deck, setDeck] = useState<DeckStatsCard[]>(initialHand.deck)

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

export function DeckAnalytics({
  cards,
  commanders,
}: {
  cards: DeckStatsCard[]
  commanders: DeckStatsCard[]
}) {
  return (
    <div className="space-y-6">
      <StatsLine cards={cards} commanders={commanders} />
      <ManaCurve cards={cards} />
      <ProbabilityTable cards={cards} commanders={commanders} />
      <ColorSpider cards={cards} />
      <HandGenerator key={cards.map((card) => `${card.id}:${card.quantity}`).join("|")} cards={cards} />
    </div>
  )
}
