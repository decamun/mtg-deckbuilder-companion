import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const repoRoot = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'deck-format-validation-'))

function emitModule(sourcePath, outPath, replacements = []) {
  let source = readFileSync(join(repoRoot, sourcePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      strict: true,
    },
  }).outputText
  let emitted = output
  for (const [from, to] of replacements) emitted = emitted.replace(from, to)
  writeFileSync(join(tmp, outPath), emitted)
}

emitModule('src/lib/game-changers.ts', 'game-changers.mjs')
emitModule('src/lib/zones.ts', 'zones.mjs')

let chSource = readFileSync(join(repoRoot, 'src/lib/canadian-highlander-rules.ts'), 'utf8')
const chJson = JSON.parse(
  readFileSync(join(repoRoot, 'src/data/canadian-highlander-rules.json'), 'utf8')
)
chSource = chSource.replace(
  /import CANADIAN_HIGHLANDER_RULES_JSON from ['"]@\/data\/canadian-highlander-rules\.json['"]\s*/,
  `const CANADIAN_HIGHLANDER_RULES_JSON = ${JSON.stringify(chJson)};\n`
)
chSource = chSource.replace(/from ['"]@\/lib\/zones['"]/, "from './zones.mjs'")
const chEmitted = ts.transpileModule(chSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    strict: true,
  },
}).outputText
writeFileSync(join(tmp, 'canadian-highlander-rules.mjs'), chEmitted)

emitModule('src/lib/deck-format-validation.ts', 'deck-format-validation.mjs', [
  ["from '@/lib/game-changers'", "from './game-changers.mjs'"],
  ["from '@/lib/canadian-highlander-rules'", "from './canadian-highlander-rules.mjs'"],
  ["from '@/lib/zones'", "from './zones.mjs'"],
])

const vf = await import(pathToFileURL(join(tmp, 'deck-format-validation.mjs')).href)

assert.equal(vf.normalizeFormatForValidation('COMMANDER'), 'edh')
assert.equal(vf.colorIdentityScryfallClause(['R', 'G']), 'id<=rg')
assert.equal(vf.colorIdentityScryfallClause([]), 'id=c')
assert.equal(vf.isBasicLandTypeLine('Basic Snow Land — Island'), true)
assert.equal(vf.isBasicLandTypeLine('Land — Tundra'), false)
assert.equal(vf.oracleTextIgnoresSingletonCap('A deck can have any number of cards named Rats.'), true)

const allowed = vf.unionColorIdentity([['G', 'U'], ['R']])
assert.equal(vf.colorIdentityIsSubset(['U', 'R'], allowed), true)
assert.equal(vf.colorIdentityIsSubset(['W'], allowed), false)

const cmdId = 'cmd-1'
const deck = [
  {
    id: '1',
    scryfall_id: cmdId,
    oracle_id: 'o-cmd',
    name: 'Commander',
    quantity: 1,
    zone: 'mainboard',
    color_identity: ['G'],
    legalities: { commander: 'legal', standard: 'legal' },
  },
  {
    id: '2',
    scryfall_id: 'c2',
    oracle_id: 'o2',
    name: 'Off',
    quantity: 2,
    zone: 'mainboard',
    color_identity: ['G'],
    legalities: { commander: 'legal', standard: 'legal' },
  },
]

const r1 = vf.validateDeckForFormat('edh', {
  cards: deck,
  commanderScryfallIds: [cmdId],
  bracket: null,
})
assert.ok(r1.violationsByCardId.get('2')?.some((m) => m.includes('singleton')))

const r2 = vf.validateDeckForFormat('standard', {
  cards: deck,
  commanderScryfallIds: [cmdId],
  bracket: null,
})
assert.equal(r2.violationsByCardId.size, 0)

const hundredPlains = Array.from({ length: 100 }, (_, i) => ({
  id: `p-${i}`,
  scryfall_id: `plains-${i}`,
  oracle_id: 'bc71ebf6-2056-41f7-be35-b2e5c34afa99',
  name: 'Plains',
  quantity: 1,
  zone: 'mainboard',
  type_line: 'Basic Land — Plains',
  legalities: {},
}))
const rCan = vf.validateDeckForFormat('canlander', {
  cards: hundredPlains,
  commanderScryfallIds: [],
  bracket: null,
})
assert.equal(rCan.deckViolations.length, 0)
assert.equal(rCan.violationsByCardId.size, 0)

rmSync(tmp, { recursive: true })
console.log('deck-format-validation tests passed')
