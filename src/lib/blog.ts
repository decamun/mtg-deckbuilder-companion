export interface BlogPost {
  slug: string
  title: string
  date: string
  excerpt: string
  body: string[]
}

export const BLOG_POSTS: BlogPost[] = [
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
