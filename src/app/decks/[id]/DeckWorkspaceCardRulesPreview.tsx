"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"

import type { DeckCard } from "@/lib/types"
import type { ScryfallCard } from "@/lib/scryfall"
import { rulesTextForDisplay } from "@/lib/scryfall"
import { ManaText } from "@/components/mana/ManaText"
import { cn } from "@/lib/utils"
import { deckCardArtImageAtFaceIndex } from "./deck-workspace-pure"

export type DeckRulesHoverPayload =
  | { kind: "deck"; card: DeckCard; faceIndex: number }
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
    const idx = hover.faceIndex ?? 0
    const fr = c.face_rules
    if (fr?.length) {
      const n = fr.length
      const i = ((idx % n) + n) % n
      const f = fr[i]
      return {
        name: f.name,
        mana_cost: f.mana_cost,
        type_line: f.type_line,
        oracle_text: f.oracle_text ?? "",
      }
    }
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

/** Matches {@link rulesTextForDisplay} joiner between MDFC / multi-face oracle sections. */
const ORACLE_FACE_SECTION_SEPARATOR = "\n\n—\n\n"

function splitCardTitleForHover(name: string): { first: string; second: string | null } {
  const sep = " // "
  const i = name.indexOf(sep)
  if (i === -1) return { first: name, second: null }
  return {
    first: name.slice(0, i),
    second: name.slice(i + sep.length),
  }
}

function splitOracleIntoFaceSections(oracle: string): string[] {
  if (!oracle.includes(ORACLE_FACE_SECTION_SEPARATOR)) return [oracle]
  return oracle.split(ORACLE_FACE_SECTION_SEPARATOR).filter((s) => s.length > 0)
}

type OracleTitleFocus = "first" | "second"

function OracleTextScrollPreview({
  text,
  titleFocus,
}: {
  text: string
  titleFocus: OracleTitleFocus
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const secondSectionRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => splitOracleIntoFaceSections(text), [text])

  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight)
    if (maxScroll === 0) {
      root.scrollTop = 0
      return
    }

    if (titleFocus === "first") {
      root.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    const anchor = secondSectionRef.current
    const top = anchor ? Math.min(anchor.offsetTop, maxScroll) : Math.min(Math.floor(maxScroll / 2), maxScroll)
    root.scrollTo({ top, behavior: "smooth" })
  }, [text, titleFocus])

  return (
    <div
      ref={scrollRef}
      className="relative text-[13px] leading-relaxed text-foreground max-h-[10lh] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
    >
      <ManaText text={sections[0] ?? ""} className="block whitespace-pre-wrap" />
      {sections.length >= 2 ? (
        <>
          <div aria-hidden className="my-1 select-none text-center text-xs text-muted-foreground">
            —
          </div>
          <div ref={secondSectionRef}>
            <ManaText
              text={sections.slice(1).join(ORACLE_FACE_SECTION_SEPARATOR)}
              className="block whitespace-pre-wrap"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Art URL for the dock preview (same source as deck thumbnails / Scryfall search hits). */
export function rulesHoverPayloadToArtImageUrl(hover: DeckRulesHoverPayload): string | null {
  if (!hover) return null
  if (hover.kind === "deck") {
    const u = deckCardArtImageAtFaceIndex(hover.card, hover.faceIndex ?? 0)
    return u ?? null
  }
  const c = hover.card
  return (
    c.image_uris?.normal ??
    c.image_uris?.small ??
    c.card_faces?.[0]?.image_uris?.normal ??
    c.card_faces?.[0]?.image_uris?.small ??
    null
  )
}

const titleNameHoverClass =
  "cursor-default rounded-sm decoration-dotted underline-offset-2 hover:underline"

function DeckWorkspaceCardRulesPreviewFilled({
  fields,
  className,
}: {
  fields: CardRulesPreviewFields
  className?: string
}) {
  const [titleOracleFocus, setTitleOracleFocus] = useState<OracleTitleFocus>("first")

  const { first: titleFirst, second: titleSecond } = useMemo(
    () => splitCardTitleForHover(fields.name),
    [fields.name],
  )

  const resetOracleFocusToFirst = () => setTitleOracleFocus("first")

  return (
    <div className={cn("flex min-h-0 flex-col gap-2 text-sm", className)}>
      <div className="flex w-full min-w-0 shrink-0 items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-0 text-base font-semibold text-foreground">
            <span
              className={titleNameHoverClass}
              onMouseEnter={() => setTitleOracleFocus("first")}
            >
              <ManaText text={titleFirst} />
            </span>
            {titleSecond !== null ? (
              <>
                <span className="select-none px-0.5" onMouseEnter={() => setTitleOracleFocus("first")}>
                  {" // "}
                </span>
                <span
                  className={titleNameHoverClass}
                  onMouseEnter={() => setTitleOracleFocus("second")}
                >
                  <ManaText text={titleSecond} />
                </span>
              </>
            ) : null}
          </span>
          {fields.type_line ? (
            <span onMouseEnter={resetOracleFocusToFirst}>
              <ManaText text={fields.type_line} className="text-xs text-muted-foreground" />
            </span>
          ) : null}
        </div>
        {fields.mana_cost ? (
          <span onMouseEnter={resetOracleFocusToFirst}>
            <ManaText text={fields.mana_cost} className="shrink-0 text-sm text-muted-foreground" />
          </span>
        ) : null}
      </div>
      <div className="min-h-0 shrink-0 text-foreground" onMouseEnter={resetOracleFocusToFirst}>
        {fields.oracle_text?.trim() ? (
          <OracleTextScrollPreview text={fields.oracle_text} titleFocus={titleOracleFocus} />
        ) : (
          <span className="text-[13px] leading-relaxed text-muted-foreground">
            No oracle text on file for this card.
          </span>
        )}
      </div>
    </div>
  )
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
      <div className={cn("flex min-h-full flex-col justify-center", className)}>
        <p className="px-1 text-center text-sm italic text-muted-foreground">
          Hover a card in your decklist to read its rules text here.
        </p>
      </div>
    )
  }

  return (
    <DeckWorkspaceCardRulesPreviewFilled
      key={`${fields.name}\0${fields.oracle_text ?? ""}`}
      fields={fields}
      className={className}
    />
  )
}
