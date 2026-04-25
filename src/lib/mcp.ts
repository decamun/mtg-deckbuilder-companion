import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "./supabase/client";

export function createMcpServer() {
  const mcpServer = new McpServer({
    name: "idlebrew-MTG-Agent",
    version: "1.0.0"
  });

  // Tool: Search Scryfall
  mcpServer.tool("search_scryfall",
    { query: z.string().describe("Scryfall syntax query") },
    async ({ query }) => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const cards = data.data?.slice(0, 5).map((c: any) => `${c.name} - ${c.mana_cost} - ${c.type_line}`) || [];
        return {
          content: [{ type: "text", text: `Top 5 results for "${query}":\n${cards.join('\n')}` }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: "Error searching Scryfall." }] };
      }
    }
  );

  // Tool: Add Card to Deck
  mcpServer.tool("add_card",
    { 
      deck_id: z.string().describe("The UUID of the deck"),
      scryfall_id: z.string().describe("The Scryfall ID of the card"),
      name: z.string().describe("The name of the card"),
      quantity: z.number().default(1).describe("Number of copies to add")
    },
    async ({ deck_id, scryfall_id, name, quantity }) => {
      const { error } = await supabase
        .from('deck_cards')
        .insert({ deck_id, scryfall_id, name, quantity });
        
      if (error) {
        return { content: [{ type: "text", text: `Error adding card: ${error.message}` }] };
      }
      
      return { content: [{ type: "text", text: `Successfully added ${quantity}x ${name} to the deck.` }] };
    }
  );

  // Tool: Get Decklist
  mcpServer.tool("get_decklist",
    { deck_id: z.string() },
    async ({ deck_id }) => {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', deck_id);
        
      if (error) {
        return { content: [{ type: "text", text: `Error fetching deck: ${error.message}` }] };
      }
      
      const decklist = data.map(c => `${c.quantity}x ${c.name}`).join('\n');
      return { content: [{ type: "text", text: `Current Decklist:\n${decklist}` }] };
    }
  );

  return mcpServer;
}
