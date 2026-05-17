import { describe, expect, it } from "vitest"
import type { DeckCard } from "@/lib/types"
import { COMMANDER_ZONE_ID, MAINBOARD_ZONE_ID, SIDEBOARD_ZONE_ID } from "@/lib/zones"
import {
  compareDeckRegistrationCards,
  formatDeckRegistrationText,
} from "@/lib/deck-registration-format"

function card(partial: Partial<DeckCard> & Pick<DeckCard, "id" | "name" | "quantity" | "zone" | "scryfall_id">): DeckCard {
  return {
    deck_id: "d1",
    tags: [],
    printing_scryfall_id: null,
    finish: "nonfoil",
    oracle_id: null,
    ...partial,
  }
}

describe("compareDeckRegistrationCards", () => {
  it("orders alphabetically by name (case-insensitive base)", () => {
    const a = card({ id: "1", name: "Zurgo Helmsmasher", quantity: 1, zone: MAINBOARD_ZONE_ID, scryfall_id: "z" })
    const b = card({ id: "2", name: "Abbot of Keral Keep", quantity: 1, zone: MAINBOARD_ZONE_ID, scryfall_id: "a" })
    expect(compareDeckRegistrationCards(a, b)).toBeGreaterThan(0)
    expect(compareDeckRegistrationCards(b, a)).toBeLessThan(0)
  })

  it("uses set and collector as tie-breakers", () => {
    const a = card({
      id: "1",
      name: "Mountain",
      quantity: 1,
      zone: MAINBOARD_ZONE_ID,
      scryfall_id: "m1",
      set_code: "zen",
      collector_number: "2",
    })
    const b = card({
      id: "2",
      name: "Mountain",
      quantity: 1,
      zone: MAINBOARD_ZONE_ID,
      scryfall_id: "m2",
      set_code: "zen",
      collector_number: "10",
    })
    expect(compareDeckRegistrationCards(a, b)).toBeLessThan(0)
  })
})

describe("formatDeckRegistrationText", () => {
  const cmdThrasios = "thrasios-id"
  const cmdTymna = "tymna-id"

  it("formats commander partners alphabetically, main sorted, and DFC names", () => {
    const cards: DeckCard[] = [
      card({
        id: "c1",
        name: "Tymna the Weaver",
        quantity: 1,
        zone: COMMANDER_ZONE_ID,
        scryfall_id: cmdTymna,
        set_code: "c16",
        collector_number: "48",
      }),
      card({
        id: "c2",
        name: "Thrasios, Triton Hero",
        quantity: 1,
        zone: COMMANDER_ZONE_ID,
        scryfall_id: cmdThrasios,
        set_code: "c16",
        collector_number: "49",
      }),
      card({
        id: "m1",
        name: "Wear // Tear",
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "wear",
        set_code: "dgm",
        collector_number: "135",
      }),
      card({
        id: "m2",
        name: "Sol Ring",
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "sol",
        set_code: "c21",
        collector_number: "263",
      }),
      card({
        id: "m3",
        name: "Island",
        quantity: 7,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "is1",
        set_code: "mh2",
        collector_number: "399",
      }),
      card({
        id: "m4",
        name: "Island",
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "is2",
        set_code: "mh2",
        collector_number: "400",
      }),
    ]
    const { text, hasLinesWithoutPrintData } = formatDeckRegistrationText({
      deckName: "Test Deck",
      format: "commander",
      cards,
      commanderIds: [cmdThrasios, cmdTymna],
    })
    expect(hasLinesWithoutPrintData).toBe(false)

    const cmdIdx = text.indexOf("COMMANDER")
    const mainIdx = text.indexOf("MAIN DECK")
    expect(cmdIdx).toBeGreaterThanOrEqual(0)
    expect(mainIdx).toBeGreaterThan(cmdIdx)

    const cmdBlock = text.slice(cmdIdx, mainIdx)
    expect(cmdBlock.indexOf("Thrasios")).toBeLessThan(cmdBlock.indexOf("Tymna"))

    expect(text).toContain("7 Island (MH2) 399")
    expect(text).toContain("1 Island (MH2) 400")
    expect(text).toContain("1 Wear // Tear (DGM) 135")
    expect(text).not.toContain("SIDEBOARD")
  })

  it("includes sideboard when non-empty and flags missing print data", () => {
    const cards: DeckCard[] = [
      card({
        id: "s1",
        name: "Tormod's Crypt",
        quantity: 1,
        zone: SIDEBOARD_ZONE_ID,
        scryfall_id: "tormod",
        set_code: "tsb",
        collector_number: "12",
      }),
      card({
        id: "m1",
        name: "Mystic Remora",
        quantity: 1,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "rem",
      }),
    ]
    const { text, hasLinesWithoutPrintData } = formatDeckRegistrationText({
      deckName: "Side Test",
      format: "modern",
      cards,
      commanderIds: [],
    })
    expect(hasLinesWithoutPrintData).toBe(true)
    expect(text).toContain("SIDEBOARD")
    expect(text).toContain("1 Tormod's Crypt (TSB) 12")
    expect(text).toContain("1 Mystic Remora")
    expect(text).toMatch(/Some lines list name and quantity only/)
  })

  it("omits commander block when no commander ids match", () => {
    const cards: DeckCard[] = [
      card({
        id: "m1",
        name: "Grizzly Bears",
        quantity: 4,
        zone: MAINBOARD_ZONE_ID,
        scryfall_id: "bear",
        set_code: "lea",
        collector_number: "100",
      }),
    ]
    const { text } = formatDeckRegistrationText({
      deckName: "Vanilla",
      format: null,
      cards,
      commanderIds: [],
    })
    expect(text).not.toContain("COMMANDER")
    expect(text).toContain("MAIN DECK")
    expect(text).toContain("4 Grizzly Bears (LEA) 100")
  })
})
