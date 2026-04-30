// Shared application types.

export interface Deck {
  id: string
  name: string
  format: string | null
  budget_usd: number | string | null
  bracket: number | null
  cover_image_scryfall_id: string | null
  commander_scryfall_ids: string[]
  user_id: string
  created_at: string
  description?: string | null
  is_public: boolean
  primer_markdown: string
  updated_at?: string
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
  // Per-card printing & foiling
  printing_scryfall_id: string | null
  finish: 'nonfoil' | 'foil' | 'etched'
  oracle_id: string | null
  // Runtime-populated from Scryfall
  image_url?: string
  type_line?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  oracle_text?: string
  produced_mana?: string[]
  set_code?: string
  collector_number?: string
  available_finishes?: string[]
  price_usd?: number | null
  effective_printing_id?: string
}

export type ViewMode = 'visual' | 'stack' | 'list'
export type GroupingMode = 'none' | 'type' | 'mana' | 'tag'
export type SortingMode = 'name' | 'mana'

