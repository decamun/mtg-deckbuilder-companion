import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autocompleteCardNames,
  calculateCmc,
  cmcOf,
  getCard,
  getCardByName,
  getCardBySetAndCN,
  getCardFaceImages,
  getCardFaceRulesFields,
  getCardImageUrl,
  getCardsByIds,
  getCardsByOracleIds,
  getCardsCollection,
  getPrintingsByOracleId,
  resetScryfallCachesForTests,
  searchCards,
  type ScryfallCard,
  type ScryfallPrinting,
} from '@/lib/scryfall'

/** Trimmed Scryfall-shaped payloads for deterministic mocks. */
const FIXTURES = {
  searchList: {
    object: 'list',
    data: [
      {
        id: 'f3a941cc-a503-4b72-9ab6-86293ed8801a',
        name: 'Lightning Bolt',
        type_line: 'Instant',
        mana_cost: '{R}',
        oracle_text: 'Lightning Bolt deals 3 damage to any target.',
      },
    ],
  },
  cardNamed: {
    id: 'named-card-id',
    name: 'Giant Growth',
    type_line: 'Instant',
    mana_cost: '{G}',
    oracle_text: 'Target creature gets +3/+3 until end of turn.',
  },
  cardById: {
    id: '9d2d2339-4bbd-4eb9-89eb-6b72854c65ea',
    name: 'Delver of Secrets',
    layout: 'transform',
    type_line: 'Creature — Human Wizard',
    mana_cost: '{U}',
    oracle_text: 'At the beginning of your upkeep...',
    card_faces: [
      {
        name: 'Delver of Secrets',
        image_uris: {
          small: 'https://cards.scryfall.io/small/front/9/d/9d2d2339.jpg',
          normal: 'https://cards.scryfall.io/normal/front/9/d/9d2d2339.jpg',
        },
      },
      {
        name: 'Insectile Aberration',
        image_uris: {
          small: 'https://cards.scryfall.io/small/back/9/d/9d2d2339.jpg',
          normal: 'https://cards.scryfall.io/normal/back/9/d/9d2d2339.jpg',
        },
      },
    ],
  },
  splitCard: {
    id: 'split-id',
    name: 'Research',
    layout: 'split',
    type_line: 'Instant // Instant',
    mana_cost: '{U}',
    oracle_text: '',
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/split.jpg',
      small: 'https://cards.scryfall.io/small/front/split.jpg',
    },
    card_faces: [
      { name: 'Research', image_uris: { normal: 'https://example.com/r.jpg' } },
      { name: 'Development', image_uris: { normal: 'https://example.com/d.jpg' } },
    ],
  },
  collectionResponse: {
    object: 'list',
    data: [
      {
        id: 'col-1',
        name: 'Collected One',
        type_line: 'Creature — Test',
        mana_cost: '{1}{W}',
        oracle_text: '',
      },
    ],
  },
  printing: {
    id: 'print-1',
    oracle_id: 'oracle-abc',
    name: 'Test Aura',
    type_line: 'Enchantment — Aura',
    mana_cost: '{1}{W}',
    oracle_text: 'Enchant creature',
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    collector_number: '5',
    released_at: '1993-08-05',
    finishes: ['nonfoil'],
  } satisfies ScryfallPrinting,
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? (init?.ok === false ? 404 : 200),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('scryfall pure helpers', () => {
  it('getCardFaceImages returns [] for nullish', () => {
    expect(getCardFaceImages(null)).toEqual([])
    expect(getCardFaceImages(undefined)).toEqual([])
  })

  it('getCardFaceImages uses root image_uris for single-faced cards', () => {
    const card: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
      name: 'Mountain',
      image_uris: {
        normal: 'https://cards.scryfall.io/normal/mountain.jpg',
        small: 'https://cards.scryfall.io/small/mountain.jpg',
      },
    }
    expect(getCardFaceImages(card)).toEqual([
      {
        name: 'Mountain',
        normal: 'https://cards.scryfall.io/normal/mountain.jpg',
        small: 'https://cards.scryfall.io/small/mountain.jpg',
      },
    ])
  })

  it('getCardFaceImages returns per-face images for double-faced layouts', () => {
    const layouts = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'] as const
    for (const layout of layouts) {
      const card: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
        name: 'Daybound Werewolf',
        layout,
        card_faces: [
          {
            name: 'Day',
            image_uris: { normal: 'https://example.com/day.jpg', small: 'https://example.com/day-s.jpg' },
          },
          {
            name: 'Night',
            image_uris: { normal: 'https://example.com/night.jpg', small: 'https://example.com/night-s.jpg' },
          },
        ],
      }
      expect(getCardFaceImages(card)).toEqual([
        { name: 'Day', normal: 'https://example.com/day.jpg', small: 'https://example.com/day-s.jpg' },
        { name: 'Night', normal: 'https://example.com/night.jpg', small: 'https://example.com/night-s.jpg' },
      ])
    }
  })

  it('getCardFaceImages uses root image for split/adventure (single combined image)', () => {
    expect(getCardFaceImages(FIXTURES.splitCard)).toEqual([
      {
        name: 'Research',
        normal: 'https://cards.scryfall.io/normal/front/split.jpg',
        small: 'https://cards.scryfall.io/small/front/split.jpg',
      },
    ])
  })

  it('getCardFaceImages falls back to root image_uris when DFC faces lack URIs', () => {
    const card: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
      name: 'Odd DFC',
      layout: 'transform',
      image_uris: { normal: 'https://example.com/combined.jpg' },
      card_faces: [{ name: 'Front' }, { name: 'Back' }],
    }
    expect(getCardFaceImages(card)).toEqual([
      { name: 'Odd DFC', normal: 'https://example.com/combined.jpg', small: undefined },
    ])
  })

  it('getCardFaceImages filters faces without any image URI', () => {
    const card: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
      name: 'DFC',
      layout: 'transform',
      card_faces: [{ name: 'No art' }, { name: 'Has art', image_uris: { normal: 'https://example.com/only.jpg' } }],
    }
    expect(getCardFaceImages(card)).toEqual([
      { name: 'Has art', normal: 'https://example.com/only.jpg', small: undefined },
    ])
  })

  it('getCardFaceRulesFields returns [] for nullish', () => {
    expect(getCardFaceRulesFields(null)).toEqual([])
    expect(getCardFaceRulesFields(undefined)).toEqual([])
  })

  it('getCardFaceRulesFields aligns face count with getCardFaceImages for DFC layouts', () => {
    const card: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces' | 'type_line' | 'mana_cost' | 'oracle_text'> = {
      name: 'Daybound Werewolf',
      layout: 'transform',
      type_line: 'Creature — Werewolf',
      mana_cost: '',
      oracle_text: '',
      card_faces: [
        {
          name: 'Day',
          type_line: 'Human',
          mana_cost: '{1}{W}',
          oracle_text: 'Front rules',
          image_uris: { normal: 'https://example.com/day.jpg' },
        },
        {
          name: 'Night',
          type_line: 'Werewolf',
          mana_cost: '',
          oracle_text: 'Back rules',
          image_uris: { normal: 'https://example.com/night.jpg' },
        },
      ],
    }
    expect(getCardFaceRulesFields(card).length).toBe(getCardFaceImages(card).length)
    expect(getCardFaceRulesFields(card)).toEqual([
      { name: 'Day', type_line: 'Human', mana_cost: '{1}{W}', oracle_text: 'Front rules' },
      { name: 'Night', type_line: 'Werewolf', mana_cost: '', oracle_text: 'Back rules' },
    ])
  })

  it('getCardFaceRulesFields mirrors getCardFaceImages single-face and filtered DFC cases', () => {
    const odd: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces' | 'type_line' | 'mana_cost' | 'oracle_text'> = {
      name: 'Odd DFC',
      layout: 'transform',
      type_line: 'Land // Land',
      mana_cost: '',
      oracle_text: '',
      image_uris: { normal: 'https://example.com/combined.jpg' },
      card_faces: [
        { name: 'Front', oracle_text: 'A' },
        { name: 'Back', oracle_text: 'B' },
      ],
    }
    expect(getCardFaceRulesFields(odd).length).toBe(getCardFaceImages(odd).length)

    const oneFaceArt: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces' | 'type_line' | 'mana_cost' | 'oracle_text'> = {
      name: 'DFC',
      layout: 'transform',
      type_line: '',
      mana_cost: '',
      oracle_text: '',
      card_faces: [
        { name: 'No art' },
        { name: 'Has art', oracle_text: 'Only face', image_uris: { normal: 'https://example.com/only.jpg' } },
      ],
    }
    expect(getCardFaceRulesFields(oneFaceArt)).toEqual([
      { name: 'Has art', oracle_text: 'Only face' },
    ])
  })

  it('getCardImageUrl prefers requested size then normal then small', () => {
    const a: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
      name: 'X',
      image_uris: { small: 'https://s.jpg', normal: 'https://n.jpg' },
    }
    expect(getCardImageUrl(a, 'small')).toBe('https://s.jpg')
    expect(getCardImageUrl(a, 'normal')).toBe('https://n.jpg')

    const b: Pick<ScryfallCard, 'name' | 'layout' | 'image_uris' | 'card_faces'> = {
      name: 'Y',
      image_uris: { small: 'https://only-small.jpg' },
    }
    expect(getCardImageUrl(b, 'normal')).toBe('https://only-small.jpg')
  })

  it('calculateCmc parses bracket notation and treats unknown symbols as 1', () => {
    expect(calculateCmc('')).toBe(0)
    expect(calculateCmc(undefined)).toBe(0)
    expect(calculateCmc('{2}{U}{U}')).toBe(4)
    expect(calculateCmc('{X}')).toBe(1)
    expect(calculateCmc('{W/U}')).toBe(1)
  })

  it('cmcOf prefers numeric cmc then parses mana_cost', () => {
    expect(cmcOf(null)).toBe(0)
    expect(cmcOf({ cmc: 3 })).toBe(3)
    expect(cmcOf({ mana_cost: '{1}{G}' })).toBe(2)
    expect(cmcOf({ cmc: 0, mana_cost: '{10}' })).toBe(0)
  })
})

describe('scryfall fetch clients (mocked)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetScryfallCachesForTests()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('searchCards builds cache-sensitive query URL and parses data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURES.searchList))
    const q = 'lightning bolt'
    const rows = await searchCards(q, { unique: 'cards', order: 'name', dir: 'asc' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = String(fetchMock.mock.calls[0][0])
    const u = new URL(calledUrl)
    expect(u.origin + u.pathname).toBe('https://api.scryfall.com/cards/search')
    expect(u.searchParams.get('q')).toBe(q)
    expect(u.searchParams.get('unique')).toBe('cards')
    expect(u.searchParams.get('order')).toBe('name')
    expect(u.searchParams.get('dir')).toBe('asc')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Lightning Bolt')
  })

  it('searchCards returns [] on non-OK and on thrown fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 422 }))
    expect(await searchCards('bad')).toEqual([])
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect(await searchCards('x')).toEqual([])
  })

  it('autocompleteCardNames enforces min length, caps results, and builds URL', async () => {
    expect(await autocompleteCardNames('')).toEqual([])
    expect(await autocompleteCardNames('x')).toEqual([])
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      })
    )
    const out = await autocompleteCardNames('  ab ')
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    const u = new URL(String(fetchMock.mock.calls[0][0]))
    expect(u.pathname).toBe('/cards/autocomplete')
    expect(u.searchParams.get('q')).toBe('ab')
  })

  it('getCard requests /cards/{id}, caches, and returns null on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURES.cardById))
    const first = await getCard(FIXTURES.cardById.id)
    expect(first?.name).toBe('Delver of Secrets')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://api.scryfall.com/cards/${FIXTURES.cardById.id}`
    )
    const second = await getCard(FIXTURES.cardById.id)
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }))
    expect(await getCard('missing-id')).toBeNull()
  })

  it('getCardByName uses exact= with encoding', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURES.cardNamed))
    const name = 'Giant Growth & Co.'
    const card = await getCardByName(name)
    expect(card?.id).toBe('named-card-id')
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
    )
  })

  it('getCardBySetAndCN lowercases set code in the path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURES.cardById))
    await getCardBySetAndCN('ONE', '333')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.scryfall.com/cards/one/333')
  })

  it('getCardsByIds POSTs identifiers and skips fetch for cached ids', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURES.collectionResponse))
    const id = 'col-1'
    const first = await getCardsByIds([id])
    expect(first).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.scryfall.com/cards/collection')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(String(init?.body))).toEqual({ identifiers: [{ id }] })

    const second = await getCardsByIds([id])
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getCardsCollection and getCardsByOracleIds POST expected identifier shapes', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FIXTURES.collectionResponse))
    await getCardsCollection(['A', 'B'])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      identifiers: [{ name: 'A' }, { name: 'B' }],
    })
    fetchMock.mockClear()
    await getCardsByOracleIds(['ora1', 'ora2'])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      identifiers: [{ oracle_id: 'ora1' }, { oracle_id: 'ora2' }],
    })
  })

  it('getPrintingsByOracleId builds oracle search URL and follows next_page', async () => {
    const oracleId = 'abc123oracle'
    const firstUrl =
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released&dir=asc`
    const nextUrl = 'https://api.scryfall.com/cards/search?page=2&q=oracleid%3Aabc123oracle&unique=prints'
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [FIXTURES.printing],
          has_more: true,
          next_page: nextUrl,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...FIXTURES.printing, id: 'print-2', set: 'leb' }],
          has_more: false,
        })
      )

    const all = await getPrintingsByOracleId(oracleId)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(firstUrl)
    expect(String(fetchMock.mock.calls[1][0])).toBe(nextUrl)
    expect(all.map(p => p.id)).toEqual(['print-1', 'print-2'])

    fetchMock.mockClear()
    const cached = await getPrintingsByOracleId(oracleId)
    expect(cached).toEqual(all)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getPrintingsByOracleId returns [] for empty id and dedupes concurrent in-flight requests', async () => {
    expect(await getPrintingsByOracleId('')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    resetScryfallCachesForTests()
    let release!: () => void
    const gate = new Promise<void>(r => {
      release = r
    })
    fetchMock.mockImplementationOnce(async () => {
      await gate
      return jsonResponse({ data: [FIXTURES.printing], has_more: false })
    })
    const oid = 'dedupe-oracle'
    const p1 = getPrintingsByOracleId(oid)
    const p2 = getPrintingsByOracleId(oid)
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release()
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toEqual(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
