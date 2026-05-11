import type { VersionSnapshot, VersionSnapshotCard } from "@/lib/versions"
import {
  aggregateDiffableCards,
  type CardStack,
  type DiffableCard,
  stacksDataEqual,
} from "@/lib/deck-diff-core"

export type MergeSide = "ours" | "theirs"

export type CardMergeConflict = {
  id: string
  kind: "card"
  key: string
  base?: CardStack<VersionSnapshotCard>
  ours?: CardStack<VersionSnapshotCard>
  theirs?: CardStack<VersionSnapshotCard>
}

export type PrimerMergeConflict = {
  id: string
  kind: "primer"
  base: string
  ours: string
  theirs: string
}

export type DeckMetaMergeConflict = {
  id: string
  kind: "deck_meta"
  base: VersionSnapshot["deck"] | null
  ours: VersionSnapshot["deck"]
  theirs: VersionSnapshot["deck"]
}

export type DeckMergeConflict = CardMergeConflict | PrimerMergeConflict | DeckMetaMergeConflict

export type ConflictChoices = Record<string, MergeSide>

function snapshotCardToDiffable(c: VersionSnapshotCard): DiffableCard {
  return {
    zone: c.zone,
    oracle_id: c.oracle_id,
    scryfall_id: c.scryfall_id,
    printing_scryfall_id: c.printing_scryfall_id,
    effective_printing_id: c.printing_scryfall_id,
    finish: c.finish,
    name: c.name,
    quantity: c.quantity,
    tags: c.tags,
  }
}

export function deckMetaLine(s: VersionSnapshot["deck"]): string {
  return JSON.stringify({
    name: s.name,
    description: s.description,
    format: s.format,
    budget_usd: s.budget_usd ?? null,
    bracket: s.bracket ?? null,
    commanders: s.commanders,
    cover_image_scryfall_id: s.cover_image_scryfall_id,
    is_public: s.is_public,
  })
}

export function findMergeBaseVersionId(
  rows: { id: string; parent_id: string | null }[],
  headOurs: string,
  headTheirs: string
): string | null {
  const byId = new Map(rows.map(r => [r.id, r]))
  const ancestorsOurs = new Set<string>()
  let cur: string | null = headOurs
  while (cur) {
    if (ancestorsOurs.has(cur)) break
    ancestorsOurs.add(cur)
    cur = byId.get(cur)?.parent_id ?? null
  }
  cur = headTheirs
  while (cur) {
    if (ancestorsOurs.has(cur)) return cur
    cur = byId.get(cur)?.parent_id ?? null
  }
  return null
}

export function getSnapshotAtVersionId(
  rows: { id: string; snapshot: VersionSnapshot }[],
  versionId: string | null
): VersionSnapshot | null {
  if (!versionId) return null
  const row = rows.find(r => r.id === versionId)
  return row?.snapshot ?? null
}

export function collectCardMergeConflicts(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot
): CardMergeConflict[] {
  const bCards = base?.cards ?? []
  const oCards = ours.cards
  const tCards = theirs.cards

  const bMap = aggregateDiffableCards(bCards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >
  const oMap = aggregateDiffableCards(oCards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >
  const tMap = aggregateDiffableCards(tCards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >

  const keys = new Set<string>([...bMap.keys(), ...oMap.keys(), ...tMap.keys()])
  const conflicts: CardMergeConflict[] = []

  for (const key of keys) {
    const bStack = bMap.get(key)
    const oStack = oMap.get(key)
    const tStack = tMap.get(key)

    if (!bStack) {
      if (!oStack || !tStack) continue
      if (stacksDataEqual(oStack, tStack)) continue
      conflicts.push({
        id: `card:${key}`,
        kind: "card",
        key,
        base: undefined,
        ours: oStack,
        theirs: tStack,
      })
      continue
    }

    const oSameB = stacksDataEqual(oStack, bStack)
    const tSameB = stacksDataEqual(tStack, bStack)
    const oSameT = stacksDataEqual(oStack, tStack)

    if (oSameT) continue
    if (oSameB && !tSameB) continue
    if (!oSameB && tSameB) continue

    conflicts.push({
      id: `card:${key}`,
      kind: "card",
      key,
      base: bStack,
      ours: oStack,
      theirs: tStack,
    })
  }

  return conflicts
}

export function collectPrimerConflict(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot
): PrimerMergeConflict | null {
  const b = base?.primer_markdown ?? ""
  const o = ours.primer_markdown
  const t = theirs.primer_markdown
  if (o === t) return null
  if (!base) {
    if (o !== t) return { id: "primer", kind: "primer", base: b, ours: o, theirs: t }
    return null
  }
  if (o === b && t !== b) return null
  if (t === b && o !== b) return null
  return { id: "primer", kind: "primer", base: b, ours: o, theirs: t }
}

export function collectDeckMetaConflict(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot
): DeckMetaMergeConflict | null {
  const bDeck = base?.deck ?? null
  const b = base ? deckMetaLine(base.deck) : ""
  const o = deckMetaLine(ours.deck)
  const t = deckMetaLine(theirs.deck)
  if (o === t) return null
  if (!base) {
    if (o !== t) return { id: "deck:meta", kind: "deck_meta", base: null, ours: ours.deck, theirs: theirs.deck }
    return null
  }
  if (o === b && t !== b) return null
  if (t === b && o !== b) return null
  if (o !== t) {
    return { id: "deck:meta", kind: "deck_meta", base: bDeck, ours: ours.deck, theirs: theirs.deck }
  }
  return null
}

export function collectAllMergeConflicts(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot
): DeckMergeConflict[] {
  const out: DeckMergeConflict[] = [...collectCardMergeConflicts(base, ours, theirs)]
  const primer = collectPrimerConflict(base, ours, theirs)
  if (primer) out.push(primer)
  const meta = collectDeckMetaConflict(base, ours, theirs)
  if (meta) out.push(meta)
  return out
}

function pickMergedDeck(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot,
  choices: ConflictChoices
): VersionSnapshot["deck"] {
  const o = deckMetaLine(ours.deck)
  const t = deckMetaLine(theirs.deck)
  if (o === t) return { ...ours.deck }
  if (!base) {
    return choices["deck:meta"] === "theirs" ? { ...theirs.deck } : { ...ours.deck }
  }
  const b = deckMetaLine(base.deck)
  if (o === b) return { ...theirs.deck }
  if (t === b) return { ...ours.deck }
  return choices["deck:meta"] === "theirs" ? { ...theirs.deck } : { ...ours.deck }
}

function pickMergedPrimer(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot,
  choices: ConflictChoices
): string {
  const po = ours.primer_markdown
  const pt = theirs.primer_markdown
  if (po === pt) return po
  if (!base) {
    return choices["primer"] === "theirs" ? pt : po
  }
  const pb = base.primer_markdown
  if (po === pb) return pt
  if (pt === pb) return po
  return choices["primer"] === "theirs" ? pt : po
}

function resolveCardStack(
  key: string,
  bMap: Map<string, CardStack<VersionSnapshotCard>>,
  oMap: Map<string, CardStack<VersionSnapshotCard>>,
  tMap: Map<string, CardStack<VersionSnapshotCard>>,
  choices: ConflictChoices
): CardStack<VersionSnapshotCard> | null {
  const bStack = bMap.get(key)
  const oStack = oMap.get(key)
  const tStack = tMap.get(key)

  if (!bStack) {
    if (!oStack && !tStack) return null
    if (!oStack) return tStack ?? null
    if (!tStack) return oStack ?? null
    if (stacksDataEqual(oStack, tStack)) return oStack
    return choices[`card:${key}`] === "theirs" ? tStack : oStack
  }

  const oSameB = stacksDataEqual(oStack, bStack)
  const tSameB = stacksDataEqual(tStack, bStack)
  const oSameT = stacksDataEqual(oStack, tStack)

  if (oSameT) return oStack ?? tStack ?? null
  if (oSameB && !tSameB) return tStack ?? null
  if (!oSameB && tSameB) return oStack ?? null
  if (!oStack && !tStack) return null
  if (!oStack) return tStack ?? null
  if (!tStack) return oStack ?? null
  return choices[`card:${key}`] === "theirs" ? tStack : oStack
}

export function buildMergedSnapshot(
  base: VersionSnapshot | null,
  ours: VersionSnapshot,
  theirs: VersionSnapshot,
  choices: ConflictChoices
): VersionSnapshot {
  const bCards = base?.cards ?? []
  const bMap = aggregateDiffableCards(bCards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >
  const oMap = aggregateDiffableCards(ours.cards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >
  const tMap = aggregateDiffableCards(theirs.cards.map(snapshotCardToDiffable)) as Map<
    string,
    CardStack<VersionSnapshotCard>
  >

  const keys = new Set<string>([...bMap.keys(), ...oMap.keys(), ...tMap.keys()])
  const mergedCards: VersionSnapshotCard[] = []
  for (const key of keys) {
    const picked = resolveCardStack(key, bMap, oMap, tMap, choices)
    if (!picked || picked.quantity <= 0) continue
    mergedCards.push({ ...picked.card, quantity: picked.quantity })
  }

  return {
    version: 1,
    deck: pickMergedDeck(base, ours, theirs, choices),
    cards: mergedCards,
    primer_markdown: pickMergedPrimer(base, ours, theirs, choices),
  }
}

export function defaultConflictChoices(conflicts: DeckMergeConflict[], defaultSide: MergeSide): ConflictChoices {
  const out: ConflictChoices = {}
  for (const c of conflicts) {
    out[c.id] = defaultSide
  }
  return out
}
