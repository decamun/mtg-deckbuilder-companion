import { describe, expect, it } from 'vitest'
import {
  buildPartnerScryfallQuery,
  canPair,
  getPartnerKind,
} from '@/lib/commander-pairing'
import type { ScryfallCard } from '@/lib/scryfall'

function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: overrides.id ?? 'card-id',
    name: overrides.name ?? 'Card Name',
    type_line: overrides.type_line ?? 'Legendary Creature — Human',
    mana_cost: overrides.mana_cost ?? '',
    oracle_text: overrides.oracle_text ?? '',
    keywords: overrides.keywords ?? [],
    ...overrides,
  }
}

describe('getPartnerKind and buildPartnerScryfallQuery', () => {
  it.each([
    [
      'partner',
      makeCard({ keywords: ['Partner'] }),
      { kind: 'partner' },
      'is:commander keyword:partner -keyword:"partner with"',
    ],
    [
      'partner with',
      makeCard({ oracle_text: 'Partner with Pako, Arcane Retriever.' }),
      { kind: 'partner-with', partnerName: 'Pako, Arcane Retriever' },
      '!"Pako, Arcane Retriever"',
    ],
    [
      'friends forever',
      makeCard({ keywords: ['Friends forever'] }),
      { kind: 'friends-forever' },
      'is:commander keyword:"friends forever"',
    ],
    [
      'choose a background',
      makeCard({ keywords: ['Choose a Background'] }),
      { kind: 'choose-a-background' },
      't:background',
    ],
    [
      "doctor's companion",
      makeCard({ keywords: ["Doctor's companion"] }),
      { kind: 'doctors-companion' },
      'is:commander t:doctor t:"time lord"',
    ],
    [
      'time lord doctor',
      makeCard({ type_line: 'Legendary Creature — Time Lord Doctor' }),
      { kind: 'time-lord-doctor' },
      'is:commander keyword:"doctor\'s companion"',
    ],
    [
      'background',
      makeCard({ type_line: 'Legendary Enchantment — Background' }),
      { kind: 'background' },
      'is:commander keyword:"choose a background"',
    ],
  ])('detects %s cards and builds the expected partner search query', (_, card, kind, query) => {
    expect(getPartnerKind(card)).toEqual(kind)
    expect(buildPartnerScryfallQuery(card)).toBe(query)
  })

  it('returns null for non-partner commanders', () => {
    const card = makeCard({
      name: 'Atraxa, Grand Unifier',
      type_line: 'Legendary Creature — Phyrexian Angel',
    })

    expect(getPartnerKind(card)).toBeNull()
    expect(buildPartnerScryfallQuery(card)).toBeNull()
  })
})

describe('canPair', () => {
  const partnerA = makeCard({ id: 'partner-a', name: 'Akiri', keywords: ['Partner'] })
  const partnerB = makeCard({ id: 'partner-b', name: 'Silas Renn', keywords: ['Partner'] })
  const friendsA = makeCard({ id: 'friends-a', name: 'Will', keywords: ['Friends forever'] })
  const friendsB = makeCard({ id: 'friends-b', name: 'Lucas', keywords: ['Friends forever'] })
  const pairA = makeCard({
    id: 'pair-a',
    name: 'Haldan, Avid Arcanist',
    oracle_text: 'Partner with Pako, Arcane Retriever',
  })
  const pairB = makeCard({
    id: 'pair-b',
    name: 'Pako, Arcane Retriever',
    oracle_text: 'Partner with Haldan, Avid Arcanist',
  })
  const pairWrong = makeCard({
    id: 'pair-wrong',
    name: 'Wrong Partner',
    oracle_text: 'Partner with Someone Else',
  })
  const backgroundCommander = makeCard({
    id: 'background-commander',
    name: 'Burakos, Party Leader',
    keywords: ['Choose a Background'],
  })
  const background = makeCard({
    id: 'background',
    name: 'Agent of the Iron Throne',
    type_line: 'Legendary Enchantment — Background',
  })
  const doctorsCompanion = makeCard({
    id: 'doctor-companion',
    name: 'Clara Oswald',
    keywords: ["Doctor's companion"],
  })
  const doctor = makeCard({
    id: 'doctor',
    name: 'The Tenth Doctor',
    type_line: 'Legendary Creature — Time Lord Doctor',
  })
  const ordinaryCommander = makeCard({
    id: 'ordinary',
    name: 'Jodah, the Unifier',
    type_line: 'Legendary Creature — Human Wizard',
  })

  it.each([
    ['partner with partner', partnerA, partnerB, true],
    ['partner not with friends forever', partnerA, friendsA, false],
    ['friends forever with friends forever', friendsA, friendsB, true],
    ['partner with requires the named reciprocal commander', pairA, pairB, true],
    ['partner with rejects the wrong named commander', pairA, pairWrong, false],
    ['choose a background pairs with a background', backgroundCommander, background, true],
    ['background pairs back with choose a background', background, backgroundCommander, true],
    ['choose a background does not pair with partner', backgroundCommander, partnerA, false],
    ["doctor's companion pairs with a time lord doctor", doctorsCompanion, doctor, true],
    ["time lord doctor pairs back with doctor's companion", doctor, doctorsCompanion, true],
    ['ordinary commanders cannot pair', ordinaryCommander, partnerA, false],
  ])('%s', (_, first, second, expected) => {
    expect(canPair(first, second)).toBe(expected)
  })
})
