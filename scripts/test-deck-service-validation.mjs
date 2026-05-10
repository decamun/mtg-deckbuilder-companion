import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const repoRoot = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'deck-service-validation-'))

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

emitModule('src/lib/scryfall.ts', 'scryfall.mjs')
emitModule('src/lib/commander-pairing.ts', 'commander-pairing.mjs', [
  ['from "./scryfall"', 'from "./scryfall.mjs"'],
])
emitModule('src/lib/deck-format-validation.ts', 'deck-format-validation.mjs', [
  ["from './scryfall'", "from './scryfall.mjs'"],
  ["from './commander-pairing'", "from './commander-pairing.mjs'"],
])
emitModule('src/lib/deck-service.ts', 'deck-service.mjs', [
  ["import { getCard } from './scryfall';", "import { getCard } from './scryfall.mjs';"],
  ["from './deck-format-validation'", "from './deck-format-validation.mjs'"],
])

const service = await import(pathToFileURL(join(tmp, 'deck-service.mjs')).href)

const cardsById = new Map([
  [
    'base-id',
    {
      id: 'base-id',
      oracle_id: 'oracle-1',
      name: 'Canonical Card',
      type_line: 'Creature - Human',
      mana_cost: '{1}{W}',
      oracle_text: '',
      color_identity: ['W'],
      legalities: { commander: 'legal' },
    },
  ],
  [
    'printing-id',
    {
      id: 'printing-id',
      oracle_id: 'oracle-1',
      name: 'Canonical Card',
      type_line: 'Creature - Human',
      mana_cost: '{1}{W}',
      oracle_text: '',
      color_identity: ['W'],
      legalities: { commander: 'legal' },
    },
  ],
  [
    'other-printing-id',
    {
      id: 'other-printing-id',
      oracle_id: 'oracle-2',
      name: 'Other Card',
      type_line: 'Artifact',
      mana_cost: '{2}',
      oracle_text: '',
      color_identity: [],
      legalities: { commander: 'legal' },
    },
  ],
  [
    'sol-ring-id',
    {
      id: 'sol-ring-id',
      oracle_id: 'oracle-sol',
      name: 'Sol Ring',
      type_line: 'Artifact',
      mana_cost: '{1}',
      oracle_text: '',
      color_identity: [],
      legalities: { commander: 'legal' },
    },
  ],
  [
    'banned-id',
    {
      id: 'banned-id',
      oracle_id: 'oracle-ban',
      name: 'Banned Card',
      type_line: 'Sorcery',
      mana_cost: '{B}',
      oracle_text: '',
      color_identity: ['B'],
      legalities: { commander: 'banned' },
    },
  ],
])

function cardByOracleId(oracleId) {
  for (const c of cardsById.values()) {
    if (c.oracle_id === oracleId) return c
  }
  return undefined
}

globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/cards/collection')) {
    const body = JSON.parse(init?.body ?? '{}')
    const identifiers = body.identifiers ?? []
    const data = []
    for (const idObj of identifiers) {
      let card
      if (idObj.id) card = cardsById.get(idObj.id)
      else if (idObj.oracle_id) card = cardByOracleId(idObj.oracle_id)
      if (card) data.push(card)
    }
    return {
      ok: true,
      json: async () => ({ data, not_found: [] }),
      text: async () => JSON.stringify({ data, not_found: [] }),
    }
  }
  const id = u.split('/').pop()?.split('?')[0]
  const card = cardsById.get(id)
  return {
    ok: Boolean(card),
    json: async () => card,
    text: async () => (card ? JSON.stringify(card) : 'not found'),
  }
}

function makeQuery(table, state) {
  const query = {
    select() {
      return query
    },
    eq() {
      return query
    },
    gte(column, value) {
      state.filters.push({ table, column, value, operator: 'gte' })
      return query
    },
    order() {
      return query
    },
    limit() {
      return query
    },
    update(values) {
      state.operations.push({ table, type: 'update', values })
      return query
    },
    insert(values) {
      state.operations.push({ table, type: 'insert', values })
      return query
    },
    delete() {
      state.operations.push({ table, type: 'delete' })
      return query
    },
    maybeSingle: async () => {
      if (table === 'decks') return { data: state.deck, error: null }
      if (table === 'deck_cards') return { data: state.existingCard ?? null, error: null }
      if (table === 'deck_versions') return { data: state.latestVersion ?? null, error: null }
      return { data: null, error: null }
    },
    single: async () => {
      const op = state.operations.at(-1)
      if (table === 'deck_cards' && op?.type === 'insert') {
        return { data: { id: 'row-1', zone: 'mainboard', tags: [], ...op.values }, error: null }
      }
      if (table === 'deck_cards' && op?.type === 'update') {
        return { data: { ...state.existingCard, ...op.values }, error: null }
      }
      if (table === 'decks' && op?.type === 'update') {
        return { data: { ...state.deck, ...op.values }, error: null }
      }
      return { data: null, error: null }
    },
    then(onFulfilled, onRejected) {
      if (table === 'deck_cards') {
        return Promise.resolve({ data: state.deckCardRows ?? [], error: null }).then(onFulfilled, onRejected)
      }
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected)
    },
  }
  return query
}

function makeSupabase(overrides = {}) {
  const state = {
    deck: {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Deck',
      format: null,
      description: null,
      is_public: false,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: [],
      primer_markdown: '',
      created_at: new Date(0).toISOString(),
    },
    deckCardRows: [],
    existingCard: null,
    latestVersion: { id: 'version-1' },
    operations: [],
    filters: [],
    ...overrides,
  }
  return {
    state,
    from(table) {
      return makeQuery(table, state)
    },
  }
}

{
  const supabase = makeSupabase()
  const row = await service.addCard(supabase, 'user-1', 'deck-1', {
    scryfall_id: 'base-id',
    oracle_id: 'hallucinated-oracle',
    printing_scryfall_id: 'printing-id',
    name: 'Hallucinated Name',
    quantity: 2,
  })
  const insert = supabase.state.operations.find((op) => op.table === 'deck_cards' && op.type === 'insert')
  assert.equal(row.name, 'Canonical Card')
  assert.equal(insert.values.scryfall_id, 'base-id')
  assert.equal(insert.values.oracle_id, 'oracle-1')
  assert.equal(insert.values.printing_scryfall_id, 'printing-id')
  assert.equal(insert.values.name, 'Canonical Card')
}

{
  const supabase = makeSupabase()
  await assert.rejects(
    service.addCard(supabase, 'user-1', 'deck-1', {
      scryfall_id: 'missing-id',
      name: 'Missing Card',
      quantity: 1,
    }),
    (error) => error.name === 'DeckServiceError' && error.code === 'invalid'
  )
  assert.equal(supabase.state.operations.some((op) => op.table === 'deck_cards'), false)
}

{
  const supabase = makeSupabase()
  await assert.rejects(
    service.addCard(supabase, 'user-1', 'deck-1', {
      scryfall_id: 'base-id',
      printing_scryfall_id: 'other-printing-id',
      name: 'Canonical Card',
      quantity: 1,
    }),
    /not a printing/
  )
  assert.equal(supabase.state.operations.some((op) => op.table === 'deck_cards'), false)
}

{
  const supabase = makeSupabase({
    existingCard: {
      id: 'deck-card-1',
      deck_id: 'deck-1',
      scryfall_id: 'base-id',
      oracle_id: 'oracle-1',
      printing_scryfall_id: null,
      finish: 'nonfoil',
      name: 'Canonical Card',
      quantity: 1,
      zone: 'mainboard',
      tags: [],
    },
  })
  await assert.rejects(
    service.setCardPrinting(supabase, 'user-1', 'deck-card-1', 'other-printing-id'),
    /not a printing/
  )
  assert.equal(supabase.state.operations.some((op) => op.type === 'update'), false)
}

{
  const supabase = makeSupabase()
  const row = await service.setCommanders(supabase, 'user-1', 'deck-1', ['base-id', 'base-id'])
  const update = supabase.state.operations.find((op) => op.table === 'decks' && op.type === 'update')
  assert.deepEqual(update.values.commander_scryfall_ids, ['base-id'])
  assert.deepEqual(row.commander_scryfall_ids, ['base-id'])
}

{
  const supabase = makeSupabase({
    deck: {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Deck',
      format: 'edh',
      description: null,
      is_public: false,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: [],
      primer_markdown: '',
      created_at: new Date(0).toISOString(),
    },
  })
  await assert.rejects(
    service.setCommanders(supabase, 'user-1', 'deck-1', ['base-id']),
    /cannot be your commander/
  )
  assert.equal(supabase.state.operations.some((op) => op.table === 'decks'), false)
}

{
  const supabase = makeSupabase({
    deck: {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Deck',
      format: 'edh',
      description: null,
      is_public: false,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: [],
      primer_markdown: '',
      created_at: new Date(0).toISOString(),
    },
  })
  await assert.rejects(
    service.addCard(supabase, 'user-1', 'deck-1', {
      scryfall_id: 'banned-id',
      quantity: 1,
    }),
    /banned in Commander/
  )
  assert.equal(supabase.state.operations.some((op) => op.table === 'deck_cards'), false)
}

{
  const supabase = makeSupabase({
    deck: {
      id: 'deck-1',
      user_id: 'user-1',
      name: 'Deck',
      format: 'edh',
      description: null,
      is_public: false,
      cover_image_scryfall_id: null,
      commander_scryfall_ids: [],
      primer_markdown: '',
      created_at: new Date(0).toISOString(),
    },
  })
  const row = await service.addCard(supabase, 'user-1', 'deck-1', {
    scryfall_id: 'sol-ring-id',
    quantity: 1,
  })
  assert.equal(row.name, 'Sol Ring')
}

{
  const supabase = makeSupabase()
  await assert.rejects(
    service.setCoverImage(supabase, 'user-1', 'deck-1', 'missing-id'),
    (error) => error.name === 'DeckServiceError' && error.code === 'invalid'
  )
  assert.equal(supabase.state.operations.some((op) => op.table === 'decks'), false)
}

rmSync(tmp, { recursive: true, force: true })
console.log('deck-service Scryfall validation tests passed')
