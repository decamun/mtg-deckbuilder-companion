export interface ScryfallCard {
  id: string
  name: string
  type_line: string
  mana_cost: string
  oracle_text: string
  image_uris?: {
    normal: string
    small: string
  }
}

export async function searchCards(query: string): Promise<ScryfallCard[]> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch (error) {
    console.error("Scryfall search error:", error)
    return []
  }
}

export async function getCard(id: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${id}`)
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error("Scryfall getCard error:", error)
    return null
  }
}

export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error("Scryfall getCardByName error:", error)
    return null
  }
}
