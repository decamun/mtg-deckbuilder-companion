"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ManaText } from "@/components/mana/ManaText"
import { formatPrice } from "@/lib/format"
import type { DeckCard } from "@/lib/types"
import { CardArt, CardThumbnail } from "./deck-workspace-card-media"
import { editorGroupNameForCard } from "./deck-workspace-pure"
import type { DeckWorkspaceOverflowMenusProps } from "./deck-workspace-overflow-menus"
import { DeckWorkspacePreviewDropdownMenu, DeckWorkspaceThreeDotMenu } from "./deck-workspace-overflow-menus"
import type { GroupingMode } from "@/lib/types"
import type { MutableRefObject } from "react"

const DeckDiffView = dynamic(
  () => import("@/components/deck/DeckDiffView").then((m) => ({ default: m.DeckDiffView })),
  { ssr: false }
)

export type DeckWorkspaceDialogsSectionProps = {
  grouping: GroupingMode
  displayedFormat: string | null
  formatHintsListOpen: boolean
  setFormatHintsListOpen: (v: boolean) => void
  formatHintCardList: DeckCard[]
  formatViolationMap: ReadonlyMap<string, readonly string[]>
  formatHintsMenuClosedAtRef: MutableRefObject<number>
  showClickedPreview: (c: DeckCard, groupName: string) => void
  overflowMenus: DeckWorkspaceOverflowMenusProps
  diffOpen: boolean
  setDiffOpen: (v: boolean) => void
  diffTarget: { label: string; cards: DeckCard[] } | null
  setDiffTarget: (v: { label: string; cards: DeckCard[] } | null) => void
  cards: DeckCard[]
  clickedPreview: { card: DeckCard; groupName: string } | null
  setClickedPreview: (v: { card: DeckCard; groupName: string } | null) => void
  clickedPreviewCard: DeckCard | null
  previewFaceIndex: number
  setPreviewFaceIndex: React.Dispatch<React.SetStateAction<number>>
  previewFormatHintsHovered: boolean
  setPreviewFormatHintsHovered: (v: boolean) => void
  revertConfirmOpen: boolean
  setRevertConfirmOpen: (v: boolean) => void
  reverting: boolean
  handleRevertFromBanner: () => void
  tagDialogOpen: boolean
  setTagDialogOpen: (v: boolean) => void
  customTagInput: string
  setCustomTagInput: (v: string) => void
  handleCustomTagSubmit: () => void
  cardQtyDialog: null | { mode: "add" | "remove"; cardId: string }
  setCardQtyDialog: (v: null | { mode: "add" | "remove"; cardId: string }) => void
  cardQtyDialogInput: string
  setCardQtyDialogInput: React.Dispatch<React.SetStateAction<string>>
  handleCardQtyDialogSubmit: () => void
  maxCopiesPerLine: number
  boardDialogOpen: boolean
  setBoardDialogOpen: (v: boolean) => void
  customBoardInput: string
  setCustomBoardInput: (v: string) => void
  customBoardError: string | null
  handleCustomBoardSubmit: () => void
}

export function DeckWorkspaceDialogsSection(props: DeckWorkspaceDialogsSectionProps) {
  return (
    <>
      <Dialog open={props.formatHintsListOpen} onOpenChange={props.setFormatHintsListOpen}>
        <DialogContent className="flex max-h-[min(88vh,720px)] flex-col border border-border bg-card text-foreground sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Format hints</DialogTitle>
            <DialogDescription>
              {props.formatHintCardList.length} card{props.formatHintCardList.length === 1 ? "" : "s"} that do not match{" "}
              {props.displayedFormat === "edh" ? "EDH" : "the selected"} construction hints.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/50">
            {props.formatHintCardList.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No cards to show.</p>
            ) : (
              props.formatHintCardList.map((c) => {
                const hintLines = props.formatViolationMap.get(c.id) ?? []
                const gn = editorGroupNameForCard(c, props.grouping)
                return (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between border-b border-border p-2 last:border-0 hover:bg-accent/50${hintLines.length ? " border-l-4 border-l-red-500" : ""}`}
                  >
                    <div
                      className="relative z-0 flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                      onClick={() => {
                        if (performance.now() - props.formatHintsMenuClosedAtRef.current < 450) return
                        props.setFormatHintsListOpen(false)
                        props.showClickedPreview(c, gn)
                      }}
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-muted-foreground">{c.quantity}</span>
                      {(c.face_images?.[0] || c.image_url) && (
                        <CardThumbnail
                          card={c}
                          className="h-9 shrink-0"
                          imageClassName="h-9 w-auto rounded border border-border/50"
                          overlayClassName="rounded"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <ManaText text={c.name} className="truncate font-medium text-foreground" />
                        <ManaText text={c.mana_cost} className="text-xs text-muted-foreground" />
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-red-300/95">{hintLines.join(" · ")}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="w-16 text-right font-mono text-xs text-muted-foreground tabular-nums">{formatPrice(c.price_usd)}</span>
                      <DeckWorkspaceThreeDotMenu {...props.overflowMenus} c={c} groupName={gn} align="end" />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.diffOpen && !!props.diffTarget}
        onOpenChange={(open) => {
          props.setDiffOpen(open)
          if (!open) props.setDiffTarget(null)
        }}
      >
        <DialogContent
          overlayClassName="bg-background/95 supports-backdrop-filter:backdrop-blur-none"
          className="max-h-[88vh] overflow-y-auto border border-border bg-background text-foreground shadow-2xl sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle>Diff with latest</DialogTitle>
            <DialogDescription>Compare a saved version against the current latest decklist.</DialogDescription>
          </DialogHeader>
          {props.diffTarget && (
            <DeckDiffView
              before={{ label: props.diffTarget.label, cards: props.diffTarget.cards }}
              after={{ label: "Latest", cards: props.cards }}
            />
          )}
        </DialogContent>
      </Dialog>

      {props.clickedPreview && props.clickedPreviewCard && (() => {
        const pv = props.formatViolationMap.get(props.clickedPreviewCard.id)
        return (
          <div
            className="fixed inset-0 z-[80] bg-background/20 backdrop-blur-[1px]"
            onClick={(e) => {
              if (e.target === e.currentTarget) props.setClickedPreview(null)
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 items-start gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative flex w-80 shrink-0 flex-col items-center"
                onMouseEnter={() => {
                  if (pv?.length) props.setPreviewFormatHintsHovered(true)
                }}
                onMouseLeave={() => props.setPreviewFormatHintsHovered(false)}
              >
                <CardArt
                  card={props.clickedPreviewCard}
                  imageClassName={`w-80 rounded-xl border shadow-2xl ${pv?.length ? "border-red-500/70" : "border-border/50"}`}
                  faceIndex={props.previewFaceIndex}
                  onFlip={() => props.setPreviewFaceIndex((i) => i + 1)}
                />
                {pv && pv.length > 0 && (
                  <div
                    className={`pointer-events-none absolute inset-x-2 bottom-3 z-20 max-h-[45%] overflow-y-auto shadow-lg transition-opacity duration-300 ease-out ${
                      props.previewFormatHintsHovered ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div className="rounded-lg border border-red-600 bg-zinc-950 px-3 py-2 text-xs text-red-100">
                      <div className="font-semibold text-red-300">Format hints</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {pv.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <DeckWorkspacePreviewDropdownMenu {...props.overflowMenus} c={props.clickedPreviewCard} groupName={props.clickedPreview.groupName} />
            </div>
          </div>
        )
      })()}

      <Dialog open={props.revertConfirmOpen} onOpenChange={props.setRevertConfirmOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Revert deck to this version?</DialogTitle>
            <DialogDescription>Your current deck state will be saved as a new version before reverting.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => props.setRevertConfirmOpen(false)}
              disabled={props.reverting}
              className="hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </Button>
            <Button onClick={props.handleRevertFromBanner} disabled={props.reverting}>
              {props.reverting ? "Reverting..." : "Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.tagDialogOpen} onOpenChange={props.setTagDialogOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Custom Tag</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={props.customTagInput}
              onChange={(e) => props.setCustomTagInput(e.target.value)}
              placeholder="e.g. Win Condition"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") props.handleCustomTagSubmit()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => props.setTagDialogOpen(false)} className="hover:bg-accent hover:text-accent-foreground">
              Cancel
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={props.handleCustomTagSubmit}>
              Add Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!props.cardQtyDialog}
        onOpenChange={(open) => {
          if (!open) {
            props.setCardQtyDialog(null)
            props.setCardQtyDialogInput("")
          }
        }}
      >
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          {props.cardQtyDialog && (() => {
            const d = props.cardQtyDialog
            const card = props.cards.find((c) => c.id === d.cardId)
            const isAdd = d.mode === "add"
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{isAdd ? "Add copies" : "Remove copies"}</DialogTitle>
                  <DialogDescription>
                    {card ? (
                      <>
                        <span className="font-medium text-foreground">{card.name}</span>
                        {" "}
                        — currently {card.quantity} in this deck
                        {isAdd ? ` (max ${props.maxCopiesPerLine} per line).` : "."}
                      </>
                    ) : (
                      "This card is no longer in the deck."
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={props.cardQtyDialogInput}
                    onChange={(e) => props.setCardQtyDialogInput(e.target.value)}
                    placeholder={isAdd ? "Number to add" : "Number to remove"}
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") props.handleCardQtyDialogSubmit()
                    }}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      props.setCardQtyDialog(null)
                      props.setCardQtyDialogInput("")
                    }}
                    className="hover:bg-accent hover:text-accent-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    className={isAdd ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
                    onClick={props.handleCardQtyDialogSubmit}
                    disabled={!card}
                  >
                    {isAdd ? "Add" : "Remove"}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={props.boardDialogOpen} onOpenChange={props.setBoardDialogOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Move to Custom Board</DialogTitle>
            <DialogDescription>Enter a name for the new board. The card will be moved to it immediately.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Input
              value={props.customBoardInput}
              onChange={(e) => props.setCustomBoardInput(e.target.value)}
              placeholder="e.g. Wishboard"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") props.handleCustomBoardSubmit()
              }}
              autoFocus
            />
            {props.customBoardError && (
              <p className="text-xs text-destructive">{props.customBoardError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => props.setBoardDialogOpen(false)} className="hover:bg-accent hover:text-accent-foreground">
              Cancel
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={props.handleCustomBoardSubmit} disabled={!props.customBoardInput.trim()}>
              Move Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
