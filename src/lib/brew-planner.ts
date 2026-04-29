import type { ScryfallCard } from "@/lib/scryfall"

export type BrewDeckRow = {
  deck_id: string
  scryfall_id: string
  name: string
  quantity: number
  _card: ScryfallCard
}

export type BrewInsertRow = Omit<BrewDeckRow, "_card">

export type BrewPickState = {
  gameChangerCount: number
  totalCost: number
}

type TakeOptions = {
  budgetUsd: number | null
  gameChangerLimit: number
  isGameChanger: (name: string) => boolean
}

export function priceOf(card: ScryfallCard | null | undefined): number {
  const usd = card?.prices?.usd
  const price = usd ? parseFloat(usd) : 0
  return Number.isFinite(price) ? price : 0
}

function affordableQuantity(
  unitCost: number,
  desiredQuantity: number,
  state: BrewPickState,
  budgetUsd: number | null
): number {
  if (budgetUsd === null || unitCost <= 0) return desiredQuantity
  const remainingBudget = budgetUsd - state.totalCost
  if (remainingBudget < unitCost) return 0
  return Math.min(desiredQuantity, Math.floor(remainingBudget / unitCost))
}

export function takeRowsForSlots(
  rows: BrewDeckRow[],
  slotCap: number,
  state: BrewPickState,
  opts: TakeOptions
): { taken: BrewDeckRow[]; remaining: BrewDeckRow[] } {
  const taken: BrewDeckRow[] = []
  const remaining: BrewDeckRow[] = []
  let used = 0

  for (const row of rows) {
    if (used >= slotCap) {
      remaining.push(row)
      continue
    }

    const isGc = opts.isGameChanger(row.name)
    if (isGc && state.gameChangerCount >= opts.gameChangerLimit) {
      remaining.push(row)
      continue
    }

    const slotQuantity = Math.min(row.quantity, slotCap - used)
    const qty = affordableQuantity(
      priceOf(row._card),
      slotQuantity,
      state,
      opts.budgetUsd
    )

    if (qty <= 0) {
      remaining.push(row)
      continue
    }

    taken.push({ ...row, quantity: qty })
    used += qty
    state.totalCost += priceOf(row._card) * qty
    if (isGc) state.gameChangerCount += 1

    if (qty < row.quantity) {
      remaining.push({ ...row, quantity: row.quantity - qty })
    }
  }

  return { taken, remaining }
}

export function stripBrewCard(row: BrewDeckRow): BrewInsertRow {
  return {
    deck_id: row.deck_id,
    scryfall_id: row.scryfall_id,
    name: row.name,
    quantity: row.quantity,
  }
}

export function mergeInsertRows(rows: BrewInsertRow[]): BrewInsertRow[] {
  const merged = new Map<string, BrewInsertRow>()
  for (const row of rows) {
    const key = `${row.deck_id}:${row.scryfall_id}`
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += row.quantity
    } else {
      merged.set(key, { ...row })
    }
  }
  return [...merged.values()]
}

export function totalQuantity(rows: { quantity: number }[]): number {
  return rows.reduce((sum, row) => sum + row.quantity, 0)
}

export function pickNonLandRows(params: {
  creatureRows: BrewDeckRow[]
  spellRows: BrewDeckRow[]
  creatureSlots: number
  spellSlots: number
  solRingInserted: boolean
  state: BrewPickState
  budgetUsd: number | null
  gameChangerLimit: number
  isGameChanger: (name: string) => boolean
}): {
  creatureInserts: BrewDeckRow[]
  spellInserts: BrewDeckRow[]
  backfillInserts: BrewDeckRow[]
  missingNonLandSlots: number
} {
  const takeOpts = {
    budgetUsd: params.budgetUsd,
    gameChangerLimit: params.gameChangerLimit,
    isGameChanger: params.isGameChanger,
  }
  const creaturePick = takeRowsForSlots(
    params.creatureRows,
    params.creatureSlots,
    params.state,
    takeOpts
  )
  const spellSlotsRemaining = Math.max(
    0,
    params.spellSlots - (params.solRingInserted ? 1 : 0)
  )
  const spellPick = takeRowsForSlots(
    params.spellRows,
    spellSlotsRemaining,
    params.state,
    takeOpts
  )

  const preferredNonLandSlots = params.creatureSlots + spellSlotsRemaining
  const preferredTaken =
    totalQuantity(creaturePick.taken) + totalQuantity(spellPick.taken)
  const backfillSlots = Math.max(0, preferredNonLandSlots - preferredTaken)
  const backfillPick = takeRowsForSlots(
    [...creaturePick.remaining, ...spellPick.remaining],
    backfillSlots,
    params.state,
    takeOpts
  )
  const missingNonLandSlots = Math.max(
    0,
    backfillSlots - totalQuantity(backfillPick.taken)
  )

  return {
    creatureInserts: creaturePick.taken,
    spellInserts: spellPick.taken,
    backfillInserts: backfillPick.taken,
    missingNonLandSlots,
  }
}
