import type { DeckCard } from "@/lib/types"

/** Row shape returned from `deck_cards` before Scryfall hydration merges in display fields. */
export type DeckCardRow = Omit<
  DeckCard,
  | "image_url"
  | "face_images"
  | "face_rules"
  | "type_line"
  | "mana_cost"
  | "cmc"
  | "colors"
  | "set_code"
  | "collector_number"
  | "available_finishes"
  | "price_usd"
  | "effective_printing_id"
>

export type ViewingSnapshotState = {
  versionId: string
  label: string
  cards: DeckCard[]
  deckMeta: {
    name: string
    description: string | null
    format: string | null
    bracket: number | null
    commanders: string[]
    cover_image_scryfall_id: string | null
    is_public: boolean
  }
  primerMarkdown: string
  coverImageUrl: string | null
}

export type CardInteractionPhase = "loading" | "settling" | "ready"

export type DiffTargetState = {
  label: string
  cards: DeckCard[]
}
