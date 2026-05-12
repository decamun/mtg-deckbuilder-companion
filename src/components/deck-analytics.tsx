"use client"

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { CircleHelp, Plus, Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ManaText } from "@/components/mana/ManaText"
import {
  buildManaCurveData,
  buildProbabilityRows,
  buildSpiderTotals,
  COLOR_KEYS,
  computeStatsLineSummary,
  PROB_TURNS,
  SPIDER_COLOR_KEYS,
  type OpeningMeasureId,
  type ProbRowValueKind,
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

const OPENING_MEASURE_HELP: Record<OpeningMeasureId, readonly string[]> = {
  land_drop: [
    'Hypergeometric chance that at least T playable land sources appear among the first N maindeck cards you see, where N is the small count under each turn header and land sources match the deck summary (MDFC spell backs that are lands count).',
    'The deck is modeled as uniformly shuffled with no mulligans, matching the section subtitle about going first on the play.',
    'This is a coarse land-drop signal only: taplands, sequencing, and color correctness are not part of the calculation.',
  ],
  land_drop_draw: [
    'Same land-drop question as the baseline row, except N is increased by one for each draw-tagged spell you could cast by that turn (mana value at most turn minus one).',
    'Only nonland spells with a known numeric mana value are included; unknown mana values are skipped so we never invent a cost.',
    'It is still optimistic about which spells you actually cast, so treat it as a helpful upper-ish signal rather than a full game replay.',
  ],
  expected_mana: [
    'Expected generic units from E[min(land sources drawn, turn)] plus E[min(ramp spells drawn in time, turn minus one)], counting each qualifying land source or ramp spell as one unit if it shows up in time.',
    'Ramp eligibility follows your ramp tags and the same mana-value filter as the commander row; Oracle text is not parsed for how much mana a card really makes.',
    'The numbers are expectations, not percentages—commander tax, color requirements, and fast mana that breaks the one-unit shortcut are all ignored.',
  ],
  cast_commander: [
    'Joint probability that min(land sources seen by N, turn) plus min(eligible ramp copies seen in the earlier window, turn minus one) reaches that commander mana value under one random deck order.',
    'Eligible ramp means ramp-tagged nonlands with mana value at most turn minus one, observed within the smaller draw window; land sources again include MDFC land backs.',
    'Tax, color pips, and whether you cast ramp before the commander are ignored—use it to compare lists at the same level of abstraction, not as a tournament clock.',
  ],
}

const OPENING_COLUMN_HELP = [
  'Bold headers are turns on the play before that turn land drop; the small count is how many maindeck cards you have seen so far, including your opener, and sets N for the hypergeometric draws.',
  'Commanders are excluded from that pile so the counts line up with the Analytics mainboard column.',
  'Expected mana prints a plain number in the same grid; every other numeric row is a percentage chance.',
] as const

function MeasureHelpIcon({
  paragraphs,
  'aria-label': ariaLabel,
}: {
  paragraphs: readonly string[]
  'aria-label': string
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 288, maxH: 320 })

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => setOpen(false), 140)
  }, [clearCloseTimer])

  const positionPanel = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const br = btn.getBoundingClientRect()
    const margin = 8
    const width = Math.min(288, window.innerWidth - margin * 2)
    const left = Math.max(margin, Math.min(br.left, window.innerWidth - width - margin))
    let top = br.bottom + 6
    const panel = panelRef.current
    const ph = panel?.offsetHeight ?? 0
    if (ph > 0 && top + ph > window.innerHeight - margin) {
      top = Math.max(margin, br.top - ph - 6)
    }
    const maxH = Math.max(120, Math.min(360, window.innerHeight - top - margin))
    setPos({ top, left, width, maxH })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    positionPanel()
    const raf = window.requestAnimationFrame(() => positionPanel())
    const onScroll = () => positionPanel()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      clearCloseTimer()
      window.cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open, positionPanel, paragraphs, clearCloseTimer])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "inline-flex shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
          "align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        aria-label={ariaLabel}
        onPointerEnter={() => {
          clearCloseTimer()
          setOpen(true)
        }}
        onPointerLeave={scheduleClose}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            onPointerEnter={() => {
              clearCloseTimer()
              setOpen(true)
            }}
            onPointerLeave={scheduleClose}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxH,
              zIndex: 80,
            }}
            className="overflow-y-auto rounded-md border border-border bg-popover p-3 text-left text-[11px] leading-snug text-popover-foreground shadow-lg"
          >
            {paragraphs.map((t, i) => (
              <p key={i} className={i === 0 ? undefined : "mt-2"}>
                {t}
              </p>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

function formatProbCell(valueKind: ProbRowValueKind, p: number): ReactNode {
  if (valueKind === "expected_mana") {
    return <span className="font-semibold text-sky-300 tabular-nums">{p.toFixed(2)}</span>
  }
  return <span className={`font-semibold ${probColor(p)}`}>{(p * 100).toFixed(0)}%</span>
}

/** Nice ceiling for chart axis (e.g. 3.2 → 3.5, 4.1 → 5). */
function niceManaCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const pad = Math.max(v * 0.08, 0.25)
  const raw = v + pad
  const step = raw <= 2 ? 0.5 : raw <= 6 ? 1 : 2
  return Math.ceil(raw / step) * step
}

const OPENING_CHART_COLORS = {
  expectedStroke: "#38bdf8",
  landSolid: "#34d399",
  landDraw: "rgba(251, 191, 36, 0.95)",
  commanderPalette: ["#a78bfa", "#f472b6", "#fb923c", "#2dd4bf"] as const,
}

type OpeningProbDatum = { turn: number; p: number }

function buildLinePoints(cells: (number | null)[], turns: readonly number[]): OpeningProbDatum[] {
  const out: OpeningProbDatum[] = []
  for (let i = 0; i < turns.length; i++) {
    const v = cells[i]
    if (v === null || v === undefined) continue
    out.push({ turn: turns[i], p: v })
  }
  return out
}

function OpeningPerformanceChart({
  rows,
  turns,
}: {
  rows: ReturnType<typeof buildProbabilityRows>["rows"]
  turns: readonly number[]
}) {
  const gradId = useId().replace(/:/g, "")
  const expectedRow = rows.find(r => r.measureId === "expected_mana")
  const landDropRows = rows.filter(r => r.measureId === "land_drop")
  const commanderRows = rows.filter(r => r.measureId === "cast_commander")

  const manaSeries = expectedRow ? buildLinePoints(expectedRow.cells, turns) : []
  const manaMax = niceManaCeil(
    manaSeries.length ? Math.max(...manaSeries.map(d => d.p), 0.01) : 1,
  )

  const pctSeriesLand = landDropRows[0] ? buildLinePoints(landDropRows[0].cells, turns) : []
  const pctSeriesLandDraw = landDropRows[1] ? buildLinePoints(landDropRows[1].cells, turns) : []
  const commanderSeries = commanderRows.map((r, idx) => ({
    key: `${idx}-${r.label}`,
    label: r.label.replace(/^Cast\s+/i, ""),
    color: OPENING_CHART_COLORS.commanderPalette[idx % OPENING_CHART_COLORS.commanderPalette.length],
    points: buildLinePoints(r.cells, turns),
  }))

  const hasChart =
    manaSeries.length > 0 ||
    pctSeriesLand.length > 0 ||
    pctSeriesLandDraw.length > 0 ||
    commanderSeries.some(s => s.points.length > 0)

  if (!hasChart) return null

  const vbW = 560
  const vbH = 200
  const m = { l: 46, r: 46, t: 22, b: 34 }
  const pw = vbW - m.l - m.r
  const ph = vbH - m.t - m.b

  const xAt = (turn: number) => {
    const tMin = turns[0]
    const tMax = turns[turns.length - 1]
    const span = Math.max(1, tMax - tMin)
    return m.l + ((turn - tMin) / span) * pw
  }

  const yMana = (mana: number) => m.t + ph - (mana / manaMax) * ph
  const yPct = (p: number) => m.t + ph - Math.min(1, Math.max(0, p)) * ph

  const linePath = (pts: OpeningProbDatum[], yFn: (v: number) => number) => {
    if (pts.length === 0) return ""
    return pts
      .map((d, i) => {
        const x = xAt(d.turn)
        const y = yFn(d.p)
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(" ")
  }

  const areaPath = (pts: OpeningProbDatum[]) => {
    if (pts.length === 0) return ""
    const line = linePath(pts, yMana)
    if (!line) return ""
    const x0 = xAt(pts[0].turn)
    const x1 = xAt(pts[pts.length - 1].turn)
    const yBase = m.t + ph
    return `${line} L ${x1.toFixed(2)} ${yBase.toFixed(2)} L ${x0.toFixed(2)} ${yBase.toFixed(2)} Z`
  }

  const gridYs = [0, 0.25, 0.5, 0.75, 1] as const
  const manaTicks = [0, manaMax / 2, manaMax].map(v => ({
    v,
    y: yMana(v),
    label: Number.isInteger(v) ? String(v) : v.toFixed(1),
  }))
  const pctTicks = [0, 50, 100].map(pct => ({
    y: yPct(pct / 100),
    label: `${pct}%`,
  }))

  return (
    <div className="mb-4 rounded-lg border border-border/70 bg-gradient-to-b from-muted/25 to-transparent p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Curve overview
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {manaSeries.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-sky-400/80" aria-hidden />
              Expected mana
            </span>
          )}
          {pctSeriesLand.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-emerald-400" aria-hidden />
              Land drop
            </span>
          )}
          {pctSeriesLandDraw.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <svg width={16} height={6} className="shrink-0 overflow-visible" aria-hidden>
                <line
                  x1={0}
                  y1={3}
                  x2={16}
                  y2={3}
                  stroke={OPENING_CHART_COLORS.landDraw}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
              </svg>
              Land + draw
            </span>
          )}
          {commanderSeries.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="h-[180px] w-full min-h-[160px] max-h-[240px] sm:h-[200px]"
        role="img"
        aria-label="Opening performance: expected mana versus turn on the left axis, land and cast probabilities on the right axis"
      >
        <defs>
          <linearGradient id={`openingManaFill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridYs.map(ratio => {
          const y = m.t + ph * (1 - ratio)
          return (
            <line
              key={ratio}
              x1={m.l}
              y1={y}
              x2={vbW - m.r}
              y2={y}
              className="stroke-border/50"
              strokeWidth={1}
              strokeDasharray={ratio === 0 || ratio === 1 ? "0" : "4 5"}
            />
          )
        })}

        {turns.map(t => {
          const x = xAt(t)
          return (
            <line
              key={t}
              x1={x}
              y1={m.t}
              x2={x}
              y2={m.t + ph}
              className="stroke-border/30"
              strokeWidth={1}
            />
          )
        })}

        <text
          x={12}
          y={m.t + ph / 2}
          transform={`rotate(-90 12 ${m.t + ph / 2})`}
          className="fill-muted-foreground text-[9px] uppercase tracking-wide"
          textAnchor="middle"
        >
          Mana
        </text>
        {manaTicks.map(({ v, y, label }) => (
          <g key={`ml-${v}`}>
            <text
              x={m.l - 8}
              y={y}
              dy="0.35em"
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[9px] tabular-nums"
            >
              {label}
            </text>
          </g>
        ))}

        <text
          x={vbW - 10}
          y={m.t + ph / 2}
          transform={`rotate(90 ${vbW - 10} ${m.t + ph / 2})`}
          className="fill-muted-foreground text-[9px] uppercase tracking-wide"
          textAnchor="middle"
        >
          %
        </text>
        {pctTicks.map(({ y, label }) => (
          <text
            key={label}
            x={vbW - m.r + 8}
            y={y}
            dy="0.35em"
            textAnchor="start"
            className="fill-muted-foreground font-mono text-[9px] tabular-nums"
          >
            {label}
          </text>
        ))}

        {turns.map(t => (
          <text
            key={`tx-${t}`}
            x={xAt(t)}
            y={vbH - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-semibold tabular-nums"
          >
            {t}
          </text>
        ))}
        <text
          x={m.l + pw / 2}
          y={vbH - 1}
          textAnchor="middle"
          className="fill-muted-foreground/80 text-[9px]"
        >
          Turn (on the play)
        </text>

        {manaSeries.length > 0 && (
          <>
            <path
              d={areaPath(manaSeries)}
              fill={`url(#openingManaFill-${gradId})`}
              stroke="none"
            />
            <path
              d={linePath(manaSeries, yMana)}
              fill="none"
              stroke={OPENING_CHART_COLORS.expectedStroke}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {manaSeries.map(d => (
              <circle
                key={`m-${d.turn}`}
                cx={xAt(d.turn)}
                cy={yMana(d.p)}
                r={3.5}
                className="fill-sky-400 stroke-sky-950/30"
                strokeWidth={1}
              />
            ))}
          </>
        )}

        {pctSeriesLand.length > 0 && (
          <>
            <path
              d={linePath(pctSeriesLand, yPct)}
              fill="none"
              stroke={OPENING_CHART_COLORS.landSolid}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {pctSeriesLand.map(d => (
              <circle
                key={`l-${d.turn}`}
                cx={xAt(d.turn)}
                cy={yPct(d.p)}
                r={3}
                fill={OPENING_CHART_COLORS.landSolid}
                className="stroke-emerald-950/25"
                strokeWidth={1}
              />
            ))}
          </>
        )}

        {pctSeriesLandDraw.length > 0 && (
          <path
            d={linePath(pctSeriesLandDraw, yPct)}
            fill="none"
            stroke={OPENING_CHART_COLORS.landDraw}
            strokeWidth={1.75}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {commanderSeries.map(s => (
          <g key={s.key}>
            {s.points.length > 0 && (
              <path
                d={linePath(s.points, yPct)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
            )}
            {s.points.map(d => (
              <circle
                key={`c-${s.key}-${d.turn}`}
                cx={xAt(d.turn)}
                cy={yPct(d.p)}
                r={2.75}
                fill={s.color}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={0.75}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
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
        <h3 className="font-heading text-base tracking-wider mb-2">Opening Performance</h3>
        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
          Add cards to compute opening stats.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[24rem] overflow-visible rounded-lg border border-border bg-card/60 p-4 sm:min-h-[28rem]">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h3 className="font-heading text-base tracking-wider">Opening Performance</h3>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
          <span className="min-w-0 leading-snug">
            Going first · {data.deckSize}-card deck · {data.lands} land sources
          </span>
          <MeasureHelpIcon
            paragraphs={OPENING_COLUMN_HELP}
            aria-label="How to read the turn columns"
          />
        </div>
      </div>

      <OpeningPerformanceChart rows={data.rows} turns={PROB_TURNS} />

      <div className="overflow-x-auto overflow-y-visible pb-1">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground border-b border-border/60">
              <th className="py-1.5 pr-3 text-left font-normal align-bottom">
                <div className="text-foreground/80">Turn</div>
                <div className="text-[10px] text-muted-foreground/80">Cards seen (Nc)</div>
              </th>
              {PROB_TURNS.map((T, i) => (
                <th key={T} className="min-w-[44px] px-2 py-1.5 text-center font-normal">
                  <div className="font-semibold text-foreground/80">{T}</div>
                  <div className="text-[10px] text-muted-foreground/80">{data.cardsSeen[i]}c</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr
                key={`${idx}-${row.measureId}-${row.valueKind}-${row.label}`}
                className="border-b border-border/30 last:border-0"
              >
                <td className="py-1.5 pr-3 align-top">
                  <div className="font-medium truncate max-w-[220px]" title={row.label}>
                    {row.label}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-muted-foreground">
                    {row.hint ? <span className="min-w-0 leading-snug">{row.hint}</span> : null}
                    <MeasureHelpIcon
                      paragraphs={OPENING_MEASURE_HELP[row.measureId]}
                      aria-label={`About ${row.label}`}
                    />
                  </div>
                </td>
                {row.cells.map((p, i) => (
                  <td key={i} className="px-2 py-1.5 text-center">
                    {p === null ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      formatProbCell(row.valueKind, p)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Going first on the play with a uniformly shuffled maindeck. Draw and ramp helpers only count spells with a
        known mana value. Commander tax and colored mana are not modeled—hover the (i) icons for row-by-row detail.
      </p>
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
