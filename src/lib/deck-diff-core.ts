/**
 * Pure decklist diff helpers shared by DeckDiffView and branch merge UI.
 * Card identity matches {@link DeckDiffView}: zone + oracle + printing + finish.
 */

export type DiffableCard = {
  zone?: string | null
  oracle_id?: string | null
  scryfall_id: string
  printing_scryfall_id?: string | null
  effective_printing_id?: string | null
  finish?: string | null
  name: string
  quantity: number
  tags?: string[] | null
}

export type DiffStatus = "added" | "removed" | "changed" | "unchanged"

export type CardStack<T extends DiffableCard = DiffableCard> = {
  card: T
  quantity: number
}

export type DiffEntry<T extends DiffableCard = DiffableCard> = {
  key: string
  before?: CardStack<T>
  after?: CardStack<T>
  status: DiffStatus
  typeGroup: string
  sortName: string
}

const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"]

export function cardComparisonKey(card: DiffableCard): string {
  return [
    card.zone || "mainboard",
    card.oracle_id || card.scryfall_id,
    card.effective_printing_id || card.printing_scryfall_id || card.scryfall_id,
    card.finish || "nonfoil",
  ].join("|")
}

export function cardBaseKey(card: DiffableCard): string {
  return [card.zone || "mainboard", card.oracle_id || card.scryfall_id, card.name].join("|")
}

export function aggregateDiffableCards<T extends DiffableCard>(cards: T[]): Map<string, CardStack<T>> {
  const stacks = new Map<string, CardStack<T>>()
  for (const card of cards) {
    const key = cardComparisonKey(card)
    const existing = stacks.get(key)
    const quantity = existing ? existing.quantity + card.quantity : card.quantity
    stacks.set(key, {
      card: { ...(existing?.card ?? card), quantity } as T,
      quantity,
    })
  }
  return stacks
}

function createEntry<T extends DiffableCard>(
  key: string,
  before: CardStack<T> | undefined,
  after: CardStack<T> | undefined,
  resolveTypeGroup: (card: T | undefined) => string
): DiffEntry<T> {
  const status: DiffStatus = before && after
    ? before.quantity === after.quantity && cardComparisonKey(before.card) === cardComparisonKey(after.card)
      ? "unchanged"
      : "changed"
    : before
      ? "removed"
      : "added"
  const displayCard = after?.card ?? before?.card

  return {
    key,
    before,
    after,
    status,
    typeGroup: resolveTypeGroup(displayCard),
    sortName: displayCard?.name ?? "",
  }
}

export function buildDiffEntries<T extends DiffableCard>(
  beforeCards: T[],
  afterCards: T[],
  resolveTypeGroup: (card: T | undefined) => string = () => "Other"
): DiffEntry<T>[] {
  const before = aggregateDiffableCards(beforeCards)
  const after = aggregateDiffableCards(afterCards)
  const entries: DiffEntry<T>[] = []

  for (const [key, beforeStack] of before) {
    const afterStack = after.get(key)
    if (!afterStack) continue
    entries.push(createEntry(key, beforeStack, afterStack, resolveTypeGroup))
    before.delete(key)
    after.delete(key)
  }

  const afterByBase = new Map<string, Array<[string, CardStack<T>]>>()
  for (const entry of after) {
    const k = cardBaseKey(entry[1].card)
    afterByBase.set(k, [...(afterByBase.get(k) ?? []), entry])
  }

  for (const [beforeKey, beforeStack] of Array.from(before.entries())) {
    const baseKey = cardBaseKey(beforeStack.card)
    const candidates = afterByBase.get(baseKey) ?? []
    const match = candidates.shift()
    if (candidates.length === 0) afterByBase.delete(baseKey)
    if (!match) continue

    const [afterKey, afterStack] = match
    entries.push(createEntry(`${beforeKey}=>${afterKey}`, beforeStack, afterStack, resolveTypeGroup))
    before.delete(beforeKey)
    after.delete(afterKey)
  }

  for (const [key, beforeStack] of before) entries.push(createEntry(key, beforeStack, undefined, resolveTypeGroup))
  for (const [key, afterStack] of after) entries.push(createEntry(key, undefined, afterStack, resolveTypeGroup))

  return entries.sort((a, b) => {
    const typeDelta = TYPE_ORDER.indexOf(a.typeGroup) - TYPE_ORDER.indexOf(b.typeGroup)
    if (typeDelta !== 0) return typeDelta
    return a.sortName.localeCompare(b.sortName)
  })
}

export function stacksDataEqual<T extends DiffableCard>(a?: CardStack<T>, b?: CardStack<T>): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.quantity !== b.quantity) return false
  return cardComparisonKey(a.card) === cardComparisonKey(b.card)
}
