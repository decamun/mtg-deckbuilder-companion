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
import { DeckLikeButton } from "@/components/deck/DeckLikeButton"
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
  const showSearch = !headerProps.interactionsLocked && headerProps.tab === "decklist"

  return (
    <header className="relative z-40 min-h-28 shrink-0 border-b border-border sm:h-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {headerProps.displayedCoverImageUrl ? (
          <>
            <img
              src={headerProps.displayedCoverImageUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-secondary/95 via-secondary/70 to-secondary/30" />
            <div className="absolute inset-0 backdrop-blur-[2px]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-secondary/80 backdrop-blur-md" />
        )}
      </div>

      <div className="relative z-10 flex flex-col gap-2 px-4 pb-3 pt-10 sm:absolute sm:inset-x-0 sm:bottom-0 sm:flex-row sm:flex-nowrap sm:items-end sm:gap-3 sm:pb-2 sm:pt-0">
        <div className="flex min-h-9 min-w-0 w-full items-center gap-2 sm:contents">
          <Button variant="ghost" size="sm" onClick={headerProps.onBack} className="shrink-0 text-muted-foreground hover:text-foreground">
            &larr; Back
          </Button>

          <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 sm:max-w-[min(100%,28rem)] sm:flex-none sm:border-r sm:border-border sm:pr-3">
            {headerProps.deckTitleEditing && headerProps.deck ? (
              <div ref={headerProps.deckTitleFieldRef} className="min-w-0 flex-1 sm:flex-none sm:max-w-[min(100%,28rem)]">
                <Input
                  value={headerProps.deckTitleDraft}
                  onChange={(e) => headerProps.onDeckTitleDraftChange(e.target.value)}
                  disabled={headerProps.deckTitleSaving}
                  onBlur={headerProps.onDeckTitleInputBlur}
                  onKeyDown={headerProps.onDeckTitleInputKeyDown}
                  className="h-9 w-full border-border bg-background/70 text-base font-bold text-foreground drop-shadow-md md:text-base"
                  aria-label="Deck name"
                />
              </div>
            ) : (
              <div
                className={
                  headerProps.isOwner && !headerProps.viewing && headerProps.deck
                    ? "group relative -mx-1 min-w-0 flex-1 max-w-full rounded-md px-2 py-0.5 sm:flex-none"
                    : "relative min-w-0 flex-1 max-w-full sm:flex-none"
                }
              >
                {headerProps.isOwner && !headerProps.viewing && headerProps.deck && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-md border border-border/80 bg-background/55 opacity-0 shadow-sm transition-opacity duration-300 ease-out group-hover:opacity-100"
                  />
                )}
                <h1
                  className={`relative z-10 min-w-0 truncate text-base font-bold drop-shadow-md sm:whitespace-nowrap ${headerProps.isOwner && !headerProps.viewing && headerProps.deck ? "cursor-text select-none" : ""}`}
                  title={headerProps.isOwner && !headerProps.viewing && headerProps.deck ? "Double-click to rename" : undefined}
                  onDoubleClick={headerProps.onDeckTitleDisplayDoubleClick}
                >
                  {headerProps.displayedDeckName}
                </h1>
              </div>
            )}
            <Badge variant="outline" className="shrink-0 border-border bg-background/40 text-muted-foreground backdrop-blur-sm">
              {headerProps.displayedCards.reduce((a, c) => a + c.quantity, 0)}
            </Badge>
            <Badge
              variant="outline"
              className="shrink-0 border-border bg-background/40 font-mono text-muted-foreground backdrop-blur-sm"
              title={headerProps.totalUsd.anyMissing ? "Some cards have no price data" : undefined}
            >
              {formatPrice(headerProps.totalUsd.sum)}
              {headerProps.totalUsd.anyMissing ? "+" : ""}
            </Badge>
            {headerProps.deck && !headerProps.deck.is_public && <Badge className="shrink-0 border-border bg-muted text-muted-foreground">Private</Badge>}
          </div>
        </div>

        <div className="flex min-h-9 w-full min-w-0 items-center gap-2 sm:contents">
          {showSearch ? (
            <div ref={headerProps.searchContainerRef} className="relative min-h-9 min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Add a card..."
                className="h-9 w-full border-border bg-background/60 pl-9 pr-4 text-foreground"
                value={headerProps.query}
                onChange={(e) => {
                  headerProps.onQueryChange(e.target.value)
                  headerProps.onSearchFocus()
                }}
                onFocus={() => headerProps.onSearchFocus()}
                onKeyDown={headerProps.onSearchKeyDown}
              />
              {headerProps.searchFocused && headerProps.results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
                  <div className="max-h-80 overflow-y-auto">
                    {headerProps.results.slice(0, 10).map((card, idx) => (
                      <div
                        key={card.id}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                          idx === headerProps.selectedResultIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                        }`}
                        onMouseEnter={() => headerProps.onSearchResultHover(idx)}
                        onClick={() => headerProps.onAddCard(card)}
                      >
                        {getCardImageUrl(card, "small") && (
                          <img src={getCardImageUrl(card, "small")} alt="" className="h-auto w-7 shrink-0 rounded" draggable={false} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{card.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{card.type_line}</div>
                        </div>
                        <ManaText text={card.mana_cost} className="ml-2 shrink-0 text-xs text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden min-h-9 sm:block sm:min-h-0 sm:flex-1 sm:min-w-0" aria-hidden />
          )}
          {headerProps.deck ? <DeckLikeButton deckId={headerProps.deckId} /> : null}
          {headerProps.isOwner && !headerProps.viewing && (
            <button
              type="button"
              onClick={() => headerProps.onOpenSettings()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent"
              title="Deck settings"
            >
              <Settings className="h-4 w-4" />
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
    </header>
  )
}
