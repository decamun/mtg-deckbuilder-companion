"use client"

import { Crown, Image as ImageIcon, ArrowRightLeft } from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import type { DeckCard, GroupingMode } from "@/lib/types"
import type { ScryfallPrinting } from "@/lib/scryfall"
import { TAG_GROUP_UNTAGGED } from "./deck-workspace-constants"
import { groupSectionHeading } from "./deck-workspace-pure"
import { getZonesForFormat } from "@/lib/zones"

export type DeckWorkspaceCardActionMenuVariant = "dropdown" | "context"

export type DeckWorkspaceCardActionMenuItemsProps = {
  variant: DeckWorkspaceCardActionMenuVariant
  c: DeckCard
  groupName: string
  grouping: GroupingMode
  commanderIds: string[]
  coverImageId: string | null
  allUniqueTags: string[]
  printings: ScryfallPrinting[]
  displayedFormat: string | null
  customZoneIds: string[]
  onEnsurePrintingsLoaded: (card: DeckCard) => void
  onSetCommander: (scryfallId: string) => void
  onSetCoverImage: (scryfallId: string) => void
  onSetCardPrinting: (cardId: string, printingId: string | null) => void
  onSetCardFinish: (cardId: string, finish: "nonfoil" | "foil" | "etched") => void
  onAddTag: (cardId: string, tag: string) => void
  onRemoveTag: (cardId: string, tag: string) => void
  onOpenCustomTagDialog: (cardId: string) => void
  onMoveToZone: (cardId: string, zone: string) => void
  onDeleteCard: (cardId: string) => void
}

export function DeckWorkspaceCardActionMenuItems(props: DeckWorkspaceCardActionMenuItemsProps) {
  const {
    variant,
    c,
    groupName,
    grouping,
    commanderIds,
    coverImageId,
    allUniqueTags,
    printings,
    displayedFormat,
    customZoneIds,
    onEnsurePrintingsLoaded,
    onSetCommander,
    onSetCoverImage,
    onSetCardPrinting,
    onSetCardFinish,
    onAddTag,
    onRemoveTag,
    onOpenCustomTagDialog,
    onMoveToZone,
    onDeleteCard,
  } = props

  const finishes = c.available_finishes ?? ["nonfoil"]
  const isCtx = variant === "context"

  const Item = isCtx ? ContextMenuItem : DropdownMenuItem
  const Sep = isCtx ? ContextMenuSeparator : DropdownMenuSeparator
  const Sub = isCtx ? ContextMenuSub : DropdownMenuSub
  const SubTrigger = isCtx ? ContextMenuSubTrigger : DropdownMenuSubTrigger
  const SubContent = isCtx ? ContextMenuSubContent : DropdownMenuSubContent

  const cmdActive = commanderIds.includes(c.scryfall_id)
  const coverActive = coverImageId === c.scryfall_id

  const cmdItemClass = isCtx
    ? cmdActive
      ? "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 focus:text-yellow-300 focus:bg-yellow-400/10"
      : ""
    : cmdActive
      ? "text-yellow-400"
      : ""

  const coverItemClass = isCtx
    ? coverActive
      ? "text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 focus:text-blue-300 focus:bg-blue-400/10"
      : ""
    : coverActive
      ? "text-blue-400"
      : ""

  const tagRemoveClass = isCtx
    ? "text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 focus:text-orange-300 focus:bg-orange-400/10"
    : "text-orange-400"

  const deleteClass = isCtx
    ? "text-destructive hover:text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10"
    : "text-destructive"

  const subContentClass = isCtx
    ? "max-h-80 overflow-y-auto bg-white border-border text-foreground"
    : "bg-white border-border text-foreground max-h-80 overflow-y-auto"

  const foilSubClass = isCtx ? "bg-white border-border text-foreground" : "bg-white border-border text-foreground"

  const currentZone = c.zone ?? "mainboard"
  const allZones = getZonesForFormat(displayedFormat, customZoneIds)
  const otherZones = allZones.filter((z) => z.id !== currentZone)

  return (
    <>
      <Item onClick={() => onSetCommander(c.scryfall_id)} className={cmdItemClass}>
        <Crown className="w-3.5 h-3.5 mr-2" />
        {cmdActive ? "Remove as Commander" : "Set as Commander"}
      </Item>
      <Item onClick={() => onSetCoverImage(c.scryfall_id)} className={coverItemClass}>
        <ImageIcon className="w-3.5 h-3.5 mr-2" />
        {coverActive ? "Remove Cover Image" : "Set as Cover Image"}
      </Item>
      <Sep className="bg-border" />
      {otherZones.length > 0 && (
        <>
          <Sub>
            <SubTrigger>
              <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
              Move to Board
            </SubTrigger>
            <SubContent className={subContentClass}>
              {otherZones.map((z) => (
                <Item
                  key={z.id}
                  onClick={() => onMoveToZone(c.id, z.id)}
                >
                  {z.label}
                  {z.id === currentZone && <span className="ml-auto text-xs text-primary">current</span>}
                </Item>
              ))}
            </SubContent>
          </Sub>
          <Sep className="bg-border" />
        </>
      )}
      <Sub>
        <SubTrigger onMouseEnter={() => void onEnsurePrintingsLoaded(c)}>Printing</SubTrigger>
        <SubContent className={subContentClass}>
          <Item className={c.printing_scryfall_id == null ? "text-primary" : ""} onClick={() => onSetCardPrinting(c.id, null)}>
            Default
          </Item>
          {printings.length > 0 && <Sep className="bg-border" />}
          {printings.map((p) => (
            <Item
              key={p.id}
              className={c.printing_scryfall_id === p.id ? "text-primary" : ""}
              onClick={() => onSetCardPrinting(c.id, p.id)}
            >
              <span className="font-mono text-xs mr-2 text-muted-foreground">{p.set?.toUpperCase()}</span>
              {p.set_name}
              <span className="ml-auto text-xs text-muted-foreground">{(p.released_at ?? "").slice(0, 4)}</span>
            </Item>
          ))}
          {printings.length === 0 && c.oracle_id && (
            <Item disabled>{isCtx ? "Loading printings..." : "Loading printings…"}</Item>
          )}
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger>Foil</SubTrigger>
        <SubContent className={foilSubClass}>
          <Item disabled={!finishes.includes("nonfoil")} className={c.finish === "nonfoil" ? "text-primary" : ""} onClick={() => onSetCardFinish(c.id, "nonfoil")}>
            Non-foil
          </Item>
          <Item disabled={!finishes.includes("foil")} className={c.finish === "foil" ? "text-primary" : ""} onClick={() => onSetCardFinish(c.id, "foil")}>
            Foil
          </Item>
          <Item disabled={!finishes.includes("etched")} className={c.finish === "etched" ? "text-primary" : ""} onClick={() => onSetCardFinish(c.id, "etched")}>
            Etched
          </Item>
        </SubContent>
      </Sub>
      <Sep className="bg-border" />
      <Sub>
        <SubTrigger>Tags</SubTrigger>
        <SubContent className={isCtx ? "bg-white border-border text-foreground" : subContentClass}>
          {allUniqueTags.map((tag) => (
            <Item
              key={tag}
              className={c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase()) ? "text-primary" : ""}
              onClick={() =>
                c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase()) ? onRemoveTag(c.id, tag) : onAddTag(c.id, tag)
              }
            >
              {c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase()) ? "Remove" : "Add"} {tag}
            </Item>
          ))}
          {allUniqueTags.length > 0 && <Sep className="bg-border" />}
          <Item onClick={() => onOpenCustomTagDialog(c.id)}>Add Custom Tag...</Item>
        </SubContent>
      </Sub>
      <Sep className="bg-border" />
      {grouping === "tag" && groupName !== TAG_GROUP_UNTAGGED && (
        <>
          <Item className={tagRemoveClass} onClick={() => onRemoveTag(c.id, groupName)}>
            Remove from &apos;{groupSectionHeading(groupName, grouping)}&apos;
          </Item>
          <Sep className="bg-border" />
        </>
      )}
      <Item
        className={deleteClass}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void onDeleteCard(c.id)
        }}
      >
        Remove from Deck
      </Item>
    </>
  )
}
