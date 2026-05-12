"use client"

/* eslint-disable react-hooks/refs -- receives RefObjects for title/search containers; only passed to DOM refs */

import { Search, Settings } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Deck, DeckCard } from "@/lib/types"
import type { ScryfallCard } from "@/lib/scryfall"
import { getCardImageUrl } from "@/lib/scryfall"
import { ManaText } from "@/components/mana/ManaText"
import { formatPrice } from "@/lib/format"
import { ExportDeckMenu } from "@/components/deck/ExportDeckMenu"
import type { DeckTab } from "@/components/deck/DeckTabs"

export type DeckWorkspaceHeaderProps = {
  deckId: string
  deck: Deck | null
  isOwner: boolean
  viewing: boolean
  tab: DeckTab
  interactionsLocked: boolean
  displayedCoverImageUrl: string | null
  displayedDeckName: string
  displayedCards: DeckCard[]
  displayedCommanderIds: string[]
  exportPrimerMarkdown: string
  totalUsd: { sum: number; anyMissing: boolean }
  deckTitleEditing: boolean
  deckTitleDraft: string
  deckTitleSaving: boolean
  deckTitleFieldRef: React.RefObject<HTMLDivElement | null>
  query: string
  searchFocused: boolean
  results: ScryfallCard[]
  selectedResultIdx: number
  searchContainerRef: React.RefObject<HTMLDivElement | null>
  onBack: () => void
  onDeckTitleDraftChange: (v: string) => void
  onDeckTitleInputBlur: () => void
  onDeckTitleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onDeckTitleDisplayDoubleClick: (e: React.MouseEvent) => void
  onQueryChange: (v: string) => void
  onSearchFocus: () => void
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSearchResultHover: (idx: number) => void
  onAddCard: (card: ScryfallCard) => void
  onOpenSettings: () => void
  onImportClick: () => void
  onVisibilityChange: (pub: boolean) => void
}

export function DeckWorkspaceHeader(headerProps: DeckWorkspaceHeaderProps) {
  return (
    <header className="border-b border-border h-28 shrink-0 relative z-40">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {headerProps.displayedCoverImageUrl ? (
          <>
            <img
              src={headerProps.displayedCoverImageUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-secondary/95 via-secondary/70 to-secondary/30" />
            <div className="absolute inset-0 backdrop-blur-[2px]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-secondary/80 backdrop-blur-md" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-2 sm:flex-row sm:items-center sm:gap-3 sm:h-14 sm:pb-0">
        <div className="flex h-9 items-center gap-2 w-full sm:contents">
          <Button variant="ghost" size="sm" onClick={headerProps.onBack} className="text-muted-foreground hover:text-foreground shrink-0">
            &larr; Back
          </Button>
          <div className="flex flex-1 min-w-0 sm:flex-none sm:shrink-0 items-center gap-2 border-r border-border pr-3">
            {headerProps.deckTitleEditing && headerProps.deck ? (
              <div ref={headerProps.deckTitleFieldRef} className="min-w-0 flex-1 sm:flex-none sm:max-w-[min(100%,28rem)]">
                <Input
                  value={headerProps.deckTitleDraft}
                  onChange={(e) => headerProps.onDeckTitleDraftChange(e.target.value)}
                  disabled={headerProps.deckTitleSaving}
                  onBlur={headerProps.onDeckTitleInputBlur}
                  onKeyDown={headerProps.onDeckTitleInputKeyDown}
                  className="h-9 w-full font-bold text-base bg-background/70 border-border text-foreground drop-shadow-md md:text-base"
                  aria-label="Deck name"
                />
              </div>
            ) : (
              <div
                className={
                  headerProps.isOwner && !headerProps.viewing && headerProps.deck
                    ? "group relative min-w-0 flex-1 max-w-full rounded-md px-2 py-0.5 -mx-1"
                    : "relative min-w-0 flex-1 max-w-full"
                }
              >
                {headerProps.isOwner && !headerProps.viewing && headerProps.deck && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-md border border-border/80 bg-background/55 shadow-sm opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
                  />
                )}
                <h1
                  className={`relative z-10 min-w-0 truncate font-bold text-base drop-shadow-md sm:whitespace-nowrap ${headerProps.isOwner && !headerProps.viewing && headerProps.deck ? "cursor-text select-none" : ""}`}
                  title={headerProps.isOwner && !headerProps.viewing && headerProps.deck ? "Double-click to rename" : undefined}
                  onDoubleClick={headerProps.onDeckTitleDisplayDoubleClick}
                >
                  {headerProps.displayedDeckName}
                </h1>
              </div>
            )}
            <Badge variant="outline" className="border-border text-muted-foreground shrink-0 bg-background/40 backdrop-blur-sm">
              {headerProps.displayedCards.reduce((a, c) => a + c.quantity, 0)}
            </Badge>
            <Badge
              variant="outline"
              className="border-border text-muted-foreground shrink-0 bg-background/40 backdrop-blur-sm font-mono"
              title={headerProps.totalUsd.anyMissing ? "Some cards have no price data" : undefined}
            >
              {formatPrice(headerProps.totalUsd.sum)}
              {headerProps.totalUsd.anyMissing ? "+" : ""}
            </Badge>
            {headerProps.deck && !headerProps.deck.is_public && <Badge className="bg-muted text-muted-foreground border-border">Private</Badge>}
          </div>
        </div>

        <div className="flex h-9 items-center gap-2 w-full sm:contents">
          {!headerProps.interactionsLocked && headerProps.tab === "decklist" ? (
            <div ref={headerProps.searchContainerRef} className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Add a card..."
                className="pl-9 pr-4 bg-background/60 border-border text-foreground h-9 w-full"
                value={headerProps.query}
                onChange={(e) => {
                  headerProps.onQueryChange(e.target.value)
                  headerProps.onSearchFocus()
                }}
                onFocus={() => headerProps.onSearchFocus()}
                onKeyDown={headerProps.onSearchKeyDown}
              />
              {headerProps.searchFocused && headerProps.results.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-50">
                  <div className="max-h-80 overflow-y-auto">
                    {headerProps.results.slice(0, 10).map((card, idx) => (
                      <div
                        key={card.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                          idx === headerProps.selectedResultIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                        }`}
                        onMouseEnter={() => headerProps.onSearchResultHover(idx)}
                        onClick={() => headerProps.onAddCard(card)}
                      >
                        {getCardImageUrl(card, "small") && (
                          <img src={getCardImageUrl(card, "small")} alt="" className="w-7 h-auto rounded shrink-0" draggable={false} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{card.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                        </div>
                        <ManaText text={card.mana_cost} className="text-xs text-muted-foreground shrink-0 ml-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-w-0" />
          )}

          <div className="flex items-center gap-2 shrink-0">
            {headerProps.isOwner && !headerProps.viewing && (
              <button
                type="button"
                onClick={() => headerProps.onOpenSettings()}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-card border border-border hover:bg-accent text-foreground"
                title="Deck settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {headerProps.deck && (
              <ExportDeckMenu
                deckId={headerProps.deckId}
                deckName={headerProps.displayedDeckName}
                cards={headerProps.displayedCards}
                primerMarkdown={headerProps.exportPrimerMarkdown}
                commanderIds={headerProps.displayedCommanderIds}
                isPublic={!!headerProps.deck.is_public}
                isOwner={headerProps.isOwner}
                onVisibilityChange={headerProps.onVisibilityChange}
                onImportClick={headerProps.isOwner && !headerProps.viewing ? headerProps.onImportClick : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
