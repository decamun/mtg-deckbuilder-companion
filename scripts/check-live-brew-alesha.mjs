import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "brew-live-check-"))
const plannerSource = readFileSync("src/lib/brew-planner.ts", "utf8").replace(
  /import type \{ ScryfallCard \} from "@\/lib\/scryfall"\n/,
  "type ScryfallCard = { id: string; name: string; type_line: string; mana_cost: string; oracle_text: string; color_identity?: string[]; prices?: { usd?: string | null } }\n"
)
const plannerPath = join(tmp, "brew-planner.ts")
const outputPath = join(tmp, "brew-planner.js")
writeFileSync(plannerPath, plannerSource)
writeFileSync(join(tmp, "package.json"), JSON.stringify({ type: "module" }))
execFileSync(
  "npx",
  [
    "tsc",
    plannerPath,
    "--target",
    "ES2022",
    "--module",
    "ES2022",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--outDir",
    tmp,
  ],
  { stdio: "inherit" }
)

const {
  pickNonLandRows,
  priceOf,
  takeRowsForSlots,
  totalQuantity,
} = await import(`file://${outputPath}`)

const deckId = "live-check"
const budgetUsd = 100
const commander = await scryfallNamed("Alesha, Who Smiles at Death")
const solRing = await scryfallNamed("Sol Ring")
const edhrec = await fetchEdhrec("alesha-who-smiles-at-death")
const names = edhrec
  .filter((row) => !["alesha, who smiles at death", "sol ring"].includes(row.name.toLowerCase()))
  .map((row) => row.name)
const cards = await scryfallCollection(names)
const byName = new Map(cards.map((card) => [card.name.toLowerCase(), card]))
const rows = { lands: [], creatures: [], spells: [] }
for (const row of edhrec) {
  const card = byName.get(row.name.toLowerCase())
  if (!card) continue
  const brewRow = {
    deck_id: deckId,
    scryfall_id: card.id,
    name: card.name,
    quantity: row.quantity,
    _card: card,
  }
  const typeLine = card.type_line.toLowerCase()
  if (typeLine.includes("land")) rows.lands.push(brewRow)
  else if (typeLine.includes("creature")) rows.creatures.push(brewRow)
  else rows.spells.push(brewRow)
}

const basicNames = ["Mountain", "Plains", "Swamp"]
const basics = await scryfallCollection(basicNames)
const basicLandUnitCost = Math.min(
  ...basics.map(priceOf).filter((price) => price > 0)
)
const state = {
  gameChangerCount: 0,
  totalCost: priceOf(commander) + priceOf(solRing),
}
const landSlots = 37
const nonLandBudgetReserve = landSlots * basicLandUnitCost
let nonlands = pickNonLandRows({
  creatureRows: rows.creatures,
  spellRows: rows.spells,
  creatureSlots: 30,
  spellSlots: 32,
  solRingInserted: true,
  state,
  budgetUsd,
  budgetReserve: nonLandBudgetReserve,
  gameChangerLimit: 3,
  isGameChanger: () => false,
})

if (nonlands.missingNonLandSlots > 0) {
  const fallbackExcludes = new Set(edhrec.map((row) => row.name.toLowerCase()))
  fallbackExcludes.add("alesha, who smiles at death")
  fallbackExcludes.add("sol ring")
  const remainingBudgetPerSlot = Math.max(
    0.01,
    (budgetUsd - state.totalCost - nonLandBudgetReserve) /
      Math.max(1, nonlands.missingNonLandSlots)
  )
  const maxPrice = Math.min(2, remainingBudgetPerSlot)
  const base = `id<=rwb legal:commander -t:land usd<=${maxPrice}`
  const creatureNeeded = Math.max(
    0,
    30 - totalQuantity([...nonlands.creatureInserts, ...nonlands.backfillInserts])
  )
  const spellNeeded = Math.max(0, 31 - totalQuantity(nonlands.spellInserts))
  const fallbackCreatures = await fallbackRows(`${base} t:creature`, creatureNeeded, fallbackExcludes)
  const fallbackSpells = await fallbackRows(`${base} (-t:creature or t:artifact)`, spellNeeded, fallbackExcludes)
  const fallbackPick = pickNonLandRows({
    creatureRows: fallbackCreatures,
    spellRows: fallbackSpells,
    creatureSlots: creatureNeeded,
    spellSlots: spellNeeded,
    solRingInserted: false,
    state,
    budgetUsd,
    budgetReserve: nonLandBudgetReserve,
    gameChangerLimit: 3,
    isGameChanger: () => false,
  })
  nonlands = {
    creatureInserts: [...nonlands.creatureInserts, ...fallbackPick.creatureInserts],
    spellInserts: [...nonlands.spellInserts, ...fallbackPick.spellInserts],
    backfillInserts: [...nonlands.backfillInserts, ...fallbackPick.backfillInserts],
    missingNonLandSlots: Math.max(
      0,
      61 -
        totalQuantity([
          ...nonlands.creatureInserts,
          ...fallbackPick.creatureInserts,
          ...nonlands.spellInserts,
          ...fallbackPick.spellInserts,
          ...nonlands.backfillInserts,
          ...fallbackPick.backfillInserts,
        ])
    ),
  }
}

const minBasicEach = Math.min(4, Math.floor(landSlots / basicNames.length))
const edhrecLandSlots = landSlots - basicNames.length * minBasicEach
const landPick = takeRowsForSlots(rows.lands, edhrecLandSlots, state, {
  budgetUsd,
  gameChangerLimit: 3,
  isGameChanger: () => false,
})
const landCount = landSlots + nonlands.missingNonLandSlots
const creatureCount = totalQuantity(nonlands.creatureInserts)
const spellCount =
  1 + totalQuantity(nonlands.spellInserts) + totalQuantity(nonlands.backfillInserts)
const total = 1 + landCount + creatureCount + spellCount

console.log(
  JSON.stringify(
    {
      total,
      landCount,
      creatureCount,
      spellCount,
      missingNonLandSlots: nonlands.missingNonLandSlots,
      budgetedCost: Number(state.totalCost.toFixed(2)),
      basicLandUnitCost,
      edhrecLandCount: totalQuantity(landPick.taken),
    },
    null,
    2
  )
)

assert.equal(total, 100)
assert.equal(landCount, 37)
assert.equal(creatureCount, 30)
assert.equal(spellCount, 32)
assert.ok(state.totalCost <= budgetUsd)

async function fetchEdhrec(slug) {
  const average = await fetch(`https://json.edhrec.com/average-decks/${slug}.json`)
  if (average.ok) {
    const data = await average.json()
    if (typeof data.deck === "string") return parseDecklist(data.deck)
    if (typeof data.decklist === "string") return parseDecklist(data.decklist)
    if (typeof data.deck?.decklist === "string") return parseDecklist(data.deck.decklist)
    if (Array.isArray(data.names) && Array.isArray(data.qty)) {
      return data.names.map((name, index) => ({
        name,
        quantity: data.qty[index] ?? 1,
      }))
    }
  }

  const res = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`)
  assert.equal(res.ok, true)
  const json = await res.json()
  const seen = new Map()
  for (const list of json.container?.json_dict?.cardlists ?? []) {
    for (const card of list.cardviews ?? []) {
      const name = card.label ?? card.name
      const inclusion = card.inclusion ?? card.num_decks ?? 0
      if (name && (!seen.has(name) || seen.get(name) < inclusion)) {
        seen.set(name, inclusion)
      }
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 99)
    .map(([name]) => ({ name, quantity: 1 }))
}

function parseDecklist(decklist) {
  return decklist
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("//")) return []
      const match = trimmed.match(/^(\d+)\s+(.+)$/)
      if (match) return [{ quantity: parseInt(match[1]), name: match[2].trim() }]
      return [{ quantity: 1, name: trimmed }]
    })
}

async function scryfallNamed(name) {
  const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
  assert.equal(res.ok, true)
  return res.json()
}

async function scryfallCollection(names) {
  const out = []
  for (let i = 0; i < names.length; i += 75) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: names.slice(i, i + 75).map((name) => ({ name })),
      }),
    })
    assert.equal(res.ok, true)
    const json = await res.json()
    out.push(...json.data)
  }
  return out
}

async function fallbackRows(query, limit, excludes) {
  if (limit <= 0) return []
  const url = new URL("https://api.scryfall.com/cards/search")
  url.searchParams.set("q", query)
  url.searchParams.set("order", "usd")
  url.searchParams.set("unique", "cards")
  const res = await fetch(url)
  if (!res.ok) return []
  const json = await res.json()
  const rows = []
  for (const card of json.data ?? []) {
    if (rows.length >= limit) break
    const name = card.name.toLowerCase()
    if (excludes.has(name)) continue
    excludes.add(name)
    rows.push({
      deck_id: deckId,
      scryfall_id: card.id,
      name: card.name,
      quantity: 1,
      _card: card,
    })
  }
  return rows
}
