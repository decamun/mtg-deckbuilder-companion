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

export async function getCardsCollection(names: string[]): Promise<ScryfallCard[]> {
  const CHUNK_SIZE = 75;
  const allCards: ScryfallCard[] = [];
  
  for (let i = 0; i < names.length; i += CHUNK_SIZE) {
    const chunk = names.slice(i, i + CHUNK_SIZE);
    try {
      const identifiers = chunk.map(name => ({ name }));
      const res = await fetch(`https://api.scryfall.com/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers })
      });
      if (!res.ok) {
        console.error("Scryfall collection error:", await res.text());
        continue;
      }
      const json = await res.json();
      if (json.data) {
        allCards.push(...json.data);
      }
      
      if (i + CHUNK_SIZE < names.length) {
         // Sleep 150ms between chunks to respect rate limit
         await new Promise(r => setTimeout(r, 150));
      }
    } catch (error) {
      console.error("Scryfall getCardsCollection error:", error);
    }
  }
  return allCards;
}
