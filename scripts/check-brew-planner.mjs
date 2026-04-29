import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "brew-planner-check-"))
const source = readFileSync("src/lib/brew-planner.ts", "utf8")
  .replace(
    /import type \{ ScryfallCard \} from "@\/lib\/scryfall"\n/,
    "type ScryfallCard = { id: string; name: string; type_line: string; mana_cost: string; oracle_text: string; prices?: { usd?: string | null } }\n"
  )

const sourcePath = join(tmp, "brew-planner.ts")
const outputPath = join(tmp, "brew-planner.js")
writeFileSync(sourcePath, source)
writeFileSync(join(tmp, "package.json"), JSON.stringify({ type: "module" }))
execFileSync(
  "npx",
  [
    "tsc",
    sourcePath,
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
  mergeInsertRows,
  pickNonLandRows,
  totalQuantity,
} = await import(`file://${outputPath}`)

const card = (name, usd, typeLine = "Creature") => ({
  deck_id: "deck-1",
  scryfall_id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  quantity: 1,
  _card: {
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    type_line: typeLine,
    mana_cost: "",
    oracle_text: "",
    prices: { usd: String(usd) },
  },
})

const state = { gameChangerCount: 0, totalCost: 0 }
const result = pickNonLandRows({
  creatureRows: [
    card("Expensive Creature 1", 10),
    card("Expensive Creature 2", 10),
    card("Cheap Creature", 1),
  ],
  spellRows: [
    card("Cheap Spell 1", 1, "Instant"),
    card("Cheap Spell 2", 1, "Sorcery"),
    card("Cheap Spell 3", 1, "Artifact"),
  ],
  creatureSlots: 2,
  spellSlots: 2,
  solRingInserted: false,
  state,
  budgetUsd: 4,
  gameChangerLimit: 20,
  isGameChanger: (name) => name.startsWith("GC "),
})

assert.equal(totalQuantity(result.creatureInserts), 1)
assert.equal(totalQuantity(result.spellInserts), 2)
assert.equal(totalQuantity(result.backfillInserts), 1)
assert.equal(result.backfillInserts[0].name, "Cheap Spell 3")
assert.equal(result.missingNonLandSlots, 0)
assert.equal(state.totalCost, 4)

const missingState = { gameChangerCount: 0, totalCost: 0 }
const missingResult = pickNonLandRows({
  creatureRows: [card("Cheap Creature", 1)],
  spellRows: [card("Cheap Spell", 1, "Instant")],
  creatureSlots: 2,
  spellSlots: 2,
  solRingInserted: false,
  state: missingState,
  budgetUsd: 2,
  gameChangerLimit: 20,
  isGameChanger: (name) => name.startsWith("GC "),
})

assert.equal(totalQuantity(missingResult.creatureInserts), 1)
assert.equal(totalQuantity(missingResult.spellInserts), 1)
assert.equal(totalQuantity(missingResult.backfillInserts), 0)
assert.equal(missingResult.missingNonLandSlots, 2)
assert.equal(missingState.totalCost, 2)

const merged = mergeInsertRows([
  { deck_id: "deck-1", scryfall_id: "swamp", name: "Swamp", quantity: 4 },
  { deck_id: "deck-1", scryfall_id: "forest", name: "Forest", quantity: 3 },
  { deck_id: "deck-1", scryfall_id: "swamp", name: "Swamp", quantity: 2 },
])

assert.deepEqual(merged, [
  { deck_id: "deck-1", scryfall_id: "swamp", name: "Swamp", quantity: 6 },
  { deck_id: "deck-1", scryfall_id: "forest", name: "Forest", quantity: 3 },
])

console.log("brew planner checks passed")
