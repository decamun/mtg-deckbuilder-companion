"use client"

import type { DeckCard } from "@/lib/types"
import type { ScryfallCard } from "@/lib/scryfall"
import { rulesTextForDisplay } from "@/lib/scryfall"
import { ManaText } from "@/components/mana/ManaText"
import { cn } from "@/lib/utils"

export type DeckRulesHoverPayload =
  | { kind: "deck"; card: DeckCard }
  | { kind: "scryfall"; card: ScryfallCard }
  | null

export type CardRulesPreviewFields = {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
}

export function rulesHoverPayloadToFields(hover: DeckRulesHoverPayload): CardRulesPreviewFields | null {
  if (!hover) return null
  if (hover.kind === "deck") {
    const c = hover.card
    return {
      name: c.name,
      mana_cost: c.mana_cost,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
    }
  }
  const c = hover.card
  return {
    name: c.name,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
    oracle_text: rulesTextForDisplay(c),
  }
}

export function DeckWorkspaceCardRulesPreview({
  fields,
  className,
}: {
  fields: CardRulesPreviewFields | null
  className?: string
}) {
  if (!fields) {
    return (
      <div className={cn("flex min-h-[5.5rem] items-center text-sm italic text-muted-foreground", className)}>
        Hover a card in your decklist to read its rules text here.
      </div>
    )
  }

  return (
    <div className={cn("flex min-h-[5.5rem] flex-col gap-2 text-sm", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <ManaText text={fields.name} className="text-base font-semibold text-foreground" />
        {fields.mana_cost ? <ManaText text={fields.mana_cost} className="text-sm text-muted-foreground" /> : null}
      </div>
      {fields.type_line ? (
        <div className="border-b border-border pb-1.5 text-xs text-muted-foreground">
          <ManaText text={fields.type_line} />
        </div>
      ) : null}
      <div className="max-h-[min(42vh,15rem)] min-h-0 flex-1 overflow-y-auto text-[13px] leading-relaxed text-foreground">
        {fields.oracle_text?.trim() ? (
          <ManaText text={fields.oracle_text} className="whitespace-pre-wrap" />
        ) : (
          <span className="text-muted-foreground">No oracle text on file for this card.</span>
        )}
      </div>
    </div>
  )
}
