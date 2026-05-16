import { describe, expect, it, vi } from "vitest"
import { commanderIdsAndCoverFromResolvedCards } from "@/lib/deck-commander-meta"
import { COMMANDER_ZONE_ID, MAINBOARD_ZONE_ID } from "@/lib/zones"

describe("commanderIdsAndCoverFromResolvedCards", () => {
  it("returns empty when no commander zone rows", () => {
    expect(
      commanderIdsAndCoverFromResolvedCards([
        { zone: MAINBOARD_ZONE_ID, scryfall_id: "a" },
      ]),
    ).toEqual({ commander_scryfall_ids: [], cover_image_scryfall_id: null })
  })

  it("dedupes and uses the sole commander for cover", () => {
    const out = commanderIdsAndCoverFromResolvedCards([
      { zone: COMMANDER_ZONE_ID, scryfall_id: "cmd" },
      { zone: COMMANDER_ZONE_ID, scryfall_id: "cmd" },
    ])
    expect(out.commander_scryfall_ids).toEqual(["cmd"])
    expect(out.cover_image_scryfall_id).toBe("cmd")
  })

  it("caps at two partners and picks cover using Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    const out = commanderIdsAndCoverFromResolvedCards([
      { zone: COMMANDER_ZONE_ID, scryfall_id: "a" },
      { zone: COMMANDER_ZONE_ID, scryfall_id: "b" },
      { zone: COMMANDER_ZONE_ID, scryfall_id: "c" },
    ])
    expect(out.commander_scryfall_ids).toEqual(["a", "b"])
    expect(out.cover_image_scryfall_id).toBe("b")
    vi.restoreAllMocks()
  })
})
