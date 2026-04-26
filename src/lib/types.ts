// Shared application types.

export interface Deck {
  id: string
  name: string
  format: string | null
  cover_image_scryfall_id: string | null
  commander_scryfall_ids: string[]
  user_id: string
  created_at: string
  description?: string | null
  // Client-side augmented (resolved from Scryfall)
  cover_url?: string
}

export interface DeckCard {
  id: string
  deck_id: string
  scryfall_id: string
  name: string
  quantity: number
  zone: string
  tags: string[]
  // Runtime-populated from Scryfall
  image_url?: string
  type_line?: string
  mana_cost?: string
  cmc?: number
}

export type ViewMode = 'visual' | 'stack' | 'list'
export type GroupingMode = 'none' | 'type' | 'mana' | 'tag'
export type SortingMode = 'name' | 'mana'
