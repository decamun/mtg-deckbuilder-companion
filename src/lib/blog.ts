export interface BlogPost {
  slug: string
  title: string
  date: string
  excerpt: string
  body: string[]
  /** When present, rendered as markdown instead of body[]. */
  markdown?: string
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "connecting-idlebrew-mcp",
    title: "Connecting to idlebrew via MCP",
    date: "2026-05-10",
    excerpt:
      "idlebrew exposes your decks over the Model Context Protocol. Claude Desktop and Cursor sign in with OAuth (no key needed), and Claude Code uses an API key — both work without installing any local bridge.",
    body: [],
    markdown: `
## What idlebrew exposes over MCP

The Model Context Protocol (MCP) is an open standard that lets AI assistants talk directly to external services and tools. When you connect an MCP client to idlebrew, your AI assistant gains live access to your decks — no copy-pasting decklists, no describing your collection manually.

The idlebrew MCP server endpoint is:

\`\`\`
https://idlebrew.com/api/mcp
\`\`\`

Once connected your assistant can search Scryfall, list your decks, read full decklists, add or remove cards, retag cards, change printings and finishes, update commanders, and write or edit deck primers in Markdown — the same operations available in the in-browser deck assistant, both interfaces staying in sync.

---

## Two ways to connect

idlebrew supports two authentication paths and you don't need to install anything for either.

- **OAuth (recommended for desktop apps).** Claude Desktop and Cursor sign in via a normal browser-based flow — the same way you'd authorize any third-party app. No keys to copy, no headers to configure. Use this for **Step 2** and **Step 4**.
- **API key (for CLI tools).** Claude Code and other command-line tools work better with a static Bearer token. Create a key in your profile and pass it as a header. Use this for **Step 3**.

---

## Step 1 — (API-key path only) Create an API key

Skip this step if you're connecting Claude Desktop or Cursor — those use OAuth and don't need a key.

For Claude Code or other CLI tools: go to your **Profile** page and scroll to **API keys (MCP)**. Click **New key**, give it a recognizable name (for example \`Claude Code — laptop\`), and click **Create key**.

The full key is shown exactly once. Copy it immediately and store it somewhere safe — a password manager is ideal. The key starts with \`idlb_\` and acts as you: any client holding it can read and modify your decks.

> **Never commit your key to version control or share it in public channels.**

---

## Step 2 — Connect Claude Desktop (OAuth, no key required)

Claude Desktop reads from a JSON config file on disk. Find it at:

| OS | Path |
|---|---|
| macOS | \`~/Library/Application Support/Claude/claude_desktop_config.json\` |
| Windows | \`%APPDATA%\\Claude\\claude_desktop_config.json\` |

You can also reach it via **Settings → Developer → Edit Config** inside Claude Desktop.

Add the idlebrew entry to \`mcpServers\`:

\`\`\`json
{
  "mcpServers": {
    "idlebrew": {
      "type": "http",
      "url": "https://idlebrew.com/api/mcp"
    }
  }
}
\`\`\`

Use \`"type": "http"\` exactly here — Claude Desktop rejects \`"streamable-http"\` as an invalid server type.

If you already have other servers in \`mcpServers\`, add \`"idlebrew"\` alongside them; do not replace the whole file.

**Fully quit and reopen Claude Desktop** (a new conversation alone is not enough). On first connect a browser tab will open at \`idlebrew.com/oauth/authorize\` asking you to sign in and approve access. After you click **Authorize**, the tab redirects back to Claude Desktop and the idlebrew tools appear in the tools panel (the plug icon). Try asking:

> *"List my idlebrew decks."*

You can revoke this connection later from your idlebrew profile page; doing so logs out the desktop client immediately.

---

## Step 3 — Connect Claude Code (API key)

Claude Code (the CLI tool) has its own HTTP transport that sends headers directly. Use the API key from Step 1 here.

### Option A: CLI command (quickest)

\`\`\`bash
claude mcp add --transport http idlebrew https://idlebrew.com/api/mcp \\
  --header "Authorization: Bearer YOUR_KEY"
\`\`\`

This writes to \`~/.claude/mcp.json\` (global, available in every project). To scope it to just the current project instead, add \`--scope project\`:

\`\`\`bash
claude mcp add --transport http --scope project idlebrew \\
  https://idlebrew.com/api/mcp \\
  --header "Authorization: Bearer YOUR_KEY"
\`\`\`

### Option B: Edit the config file manually

**Project-level** (only active inside this repo) — create or edit \`.claude/mcp.json\` at the repo root.

**Global** (active in every Claude Code session) — create or edit \`~/.claude/mcp.json\`.

Both files use the same format:

\`\`\`json
{
  "mcpServers": {
    "idlebrew": {
      "type": "http",
      "url": "https://idlebrew.com/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      }
    }
  }
}
\`\`\`

### Verify the connection

Start a new Claude Code session and run:

\`\`\`
/mcp
\`\`\`

You should see \`idlebrew\` listed as connected with its tools enumerated. If it shows as disconnected, double-check the key and URL, then run \`claude mcp list\` to confirm the entry was saved correctly.

Once connected you can prompt Claude Code with things like:

> *"Pull the decklist for my Prossh deck and tag every card that generates tokens as 'token-producer'."*

---

## Step 4 — Connect Cursor (OAuth, no key required)

**Project-level** — create or edit \`.cursor/mcp.json\` at the root of your project:

\`\`\`json
{
  "mcpServers": {
    "idlebrew": {
      "type": "streamable-http",
      "url": "https://idlebrew.com/api/mcp"
    }
  }
}
\`\`\`

**Global** — create or edit \`~/.cursor/mcp.json\` for access across all projects (same format as above).

You can also use the GUI: open **Cursor Settings → MCP → Add new global MCP server** and paste the JSON block into the editor.

After saving, run **Cursor: Reload Window** from the command palette (\`Ctrl+Shift+P\` / \`Cmd+Shift+P\`). Cursor will open a browser tab to \`idlebrew.com/oauth/authorize\` for sign-in. After authorizing, the tab returns to Cursor and the idlebrew tools become available in the Agent chat. Verify with:

> *"What decks do I have on idlebrew?"*

---

## Available tools

| Tool | What it does |
|---|---|
| \`list_decks\` | List all your decks with format and metadata |
| \`get_deck\` | Fetch a single deck's details |
| \`get_decklist\` | Get every card in a deck with quantities, tags, and printings |
| \`search_scryfall\` | Full Scryfall card search with filters |
| \`add_card\` | Add a card to a deck |
| \`remove_card\` | Remove a card from a deck |
| \`set_card_quantity\` | Change how many copies are in the deck |
| \`add_card_tag\` | Add a single tag to a card |
| \`remove_card_tag\` | Remove a single tag from a card |
| \`set_card_tags\` | Replace all tags on a card at once |
| \`set_card_printing\` | Pin a card to a specific printing (by Scryfall ID) |
| \`set_card_finish\` | Set foil, etched, or nonfoil finish |
| \`set_commanders\` | Update the commander(s) of a deck |
| \`set_cover_image\` | Change the deck's cover art |
| \`get_primer\` | Read a deck's primer (full Markdown text) |
| \`set_primer\` | Write or replace a deck's primer |
| \`patch_primer\` | Replace an exact passage without rewriting the whole primer |

---

## Troubleshooting

**Browser tab didn't open** (Claude Desktop / Cursor OAuth) — The client should open \`idlebrew.com/oauth/authorize\` automatically on first connect. If nothing happens, fully quit the client and reopen it. If your default browser is set to something the OS doesn't recognize, set a real browser as default and retry.

**OAuth tab loops or shows "Unknown client"** — Each Claude Desktop or Cursor install registers itself dynamically the first time it connects. If the metadata gets out of sync, delete the idlebrew entry from your config, fully quit the client, then re-add the entry. The next connect will register a fresh client.

**401 Unauthorized** (Claude Code, API-key path) — The key is missing, inactive, or the header is malformed. Confirm the header reads \`Authorization: Bearer YOUR_KEY\` with exactly one space after the colon. Check that the key is still active on your Profile page.

**429 Too Many Requests** — The server enforces a limit of 120 requests per minute per credential. Wait a minute and retry, or break your work into smaller prompts.

**Tools not appearing after a config change** — Claude Desktop requires a full quit-and-reopen. Cursor requires **Reload Window**. Claude Code picks up changes at the next session start; run \`claude mcp list\` to confirm the entry exists before opening a session.

**"Skipped invalid MCP server config entries" in Claude logs** — Re-check the Claude Desktop JSON shape. For remote idlebrew connections, the server block must use \`"type": "http"\` with the MCP URL.

**Wrong deck being modified** — Each connection is scoped to the account that authorized it. Confirm you are logged in to the same idlebrew account that owns the deck. To switch accounts, revoke the connection on the profile page and re-authorize from the client.
`,
  },
  {
    slug: "choosing-your-first-commander",
    title: "Choosing Your First Commander",
    date: "2026-04-22",
    excerpt:
      "Picking the right commander is the most important decision you'll make when building an EDH deck. Here's how to find one that fits your style.",
    body: [
      "Your commander defines everything — the colors you can play, the strategy you'll pursue, and the experience your opponents will have sitting across from you. Before searching for cards, it's worth spending a few minutes thinking about what kind of game you want to play.",
      "Aggro players tend to gravitate toward commanders with combat-oriented abilities, like Xenagos, God of Revels or Zurgo Helmsmasher. Control players often prefer commanders that generate card advantage or lock down the board, such as Atraxa or Rhystic Study-type engines built around Urza. Combo players look for tight synergy with a small number of key pieces.",
      "A useful shortcut: browse EDHREC's top commanders filtered by your favorite colors. The site shows average deck compositions and synergy scores, giving you a realistic sense of what you're signing up for before you ever sleeve a card. Once you land on a commander that excites you, idlebrew can scaffold the initial 100 cards in seconds.",
    ],
  },
  {
    slug: "mana-base-fundamentals",
    title: "Mana Base Fundamentals for EDH",
    date: "2026-04-15",
    excerpt:
      "Flooded on three colors or stuck on two lands? A solid mana base is the most underrated part of any Commander deck.",
    body: [
      "The golden rule of Commander mana bases: run 36–38 lands plus 8–12 mana rocks. New players consistently underestimate land counts, cutting them to fit more spells — and end up losing games to being stuck on three mana while opponents deploy threats.",
      "Prioritize dual lands that enter untapped. Shock lands (Steam Vents, Breeding Pool) and check lands (Glacial Fortress, Dragonskull Summit) are budget-friendly staples. Fetch lands are powerful but optional — the shuffling effect matters less in a singleton format. Command Tower is mandatory in any multicolor deck; it's simply the best land in the format.",
      "For mana rocks, Sol Ring remains the strongest accelerant available regardless of ban discussions. Beyond that, Arcane Signet, Commander's Sphere, and the two-mana color-fixing rocks from recent precons fill your slots efficiently. Avoid three-mana rocks unless they have an additional relevant effect.",
    ],
  },
  {
    slug: "card-advantage-in-edh",
    title: "Card Advantage: Why You're Running Out of Cards",
    date: "2026-04-08",
    excerpt:
      "Running out of cards by turn six is the most common mistake in Commander. Here's how to keep your hand full throughout a long multiplayer game.",
    body: [
      "Commander games run long. A two-hour game can easily involve 15–20 main phases per player, meaning you'll cast far more spells than in a typical 60-card game — and that means you'll need far more cards. Aim for at least 8–10 dedicated draw spells or repeatable draw engines.",
      "The best draw engines are ones that trigger repeatedly rather than providing a single burst of cards. Rhystic Study, Sylvan Library, and Phyrexian Arena each generate value turn after turn for a single mana investment. Compare this to a one-shot effect like Harmonize, which draws three cards once for four mana — solid, but not a replacement for an ongoing engine.",
      "Cantrips (draw-a-card effects attached to other spells) are also underrated. Preordain, Brainstorm, and Ponder are cheap enough to run in most blue decks and keep you from flooding or missing land drops. If you're not in blue, lean on green's 'draw when a creature enters' effects via Guardian Project or The Great Henge for a comparable engine.",
    ],
  },
]
