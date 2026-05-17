# Deck registration export format

This document describes the plain-text output produced for tournament-style deck registration (`formatDeckRegistrationText` in `src/lib/deck-registration-format.ts` and the **Registration view** UI).

## Sections and zone rules

1. **Header** — Deck title, optional format label, optional player display name (when the viewer is the deck owner and Auth metadata includes `display_name`), optional generation date (UTC `YYYY-MM-DD`).
2. **COMMANDER** — One line per card whose `scryfall_id` appears in the deck’s `commander_scryfall_ids` array (same rule as other deck exports). Sorted alphabetically by card name.
3. **MAIN DECK** — Cards that are **not** treated as commanders for this export and whose `deck_cards.zone` counts toward the main deck (`zoneCountsTowardMainDeck`). Sorted alphabetically by card name.
4. **SIDEBOARD** — Cards in the canonical sideboard zone. Omitted entirely when the sideboard is empty. Sorted alphabetically by card name.

**Excluded boards:** Maybeboard and custom zones are not listed. A short “Scope” footer in the export text states this.

## Card naming

Lines use the stored `DeckCard.name` value (oracle-style full name). Double-faced and split cards keep a single name string including ` // ` where the data model provides it.

## Sorting

Within each section, cards are ordered by:

1. `name` — `localeCompare` with `en` and `sensitivity: "base"`.
2. `set_code` — uppercase, lexicographic (tie-breaker).
3. `collector_number` — `localeCompare` with `numeric: true` (stable tie-breaker).

## Line format

- When **both** `set_code` and `collector_number` are present:  
  `{quantity} {name} ({SET}) {collector_number}`
- Otherwise:  
  `{quantity} {name}`  
  and the export appends a **Note** footer explaining that some lines omit printing identifiers.

Set codes are uppercased in the output.

## Saved versions (`?version=`)

The registration route supports `?version=<deck_versions.id>`. When present and the row is readable under RLS for the current viewer, the list is built from that snapshot (same hydration path as the deck workspace version viewer), not from the live `deck_cards` table.
