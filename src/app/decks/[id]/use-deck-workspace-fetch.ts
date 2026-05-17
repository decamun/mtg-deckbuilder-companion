"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase/client"
import { pickPrice } from "@/lib/format"
import { getCardsByIds, getCard, getCardFaceImages, getCardFaceRulesFields, getCardImageUrl, cmcOf, rulesTextForDisplay } from "@/lib/scryfall"
import type { Deck, DeckCard } from "@/lib/types"
import {
  getPrefetchedDeckCards,
  storePrefetchedDeckCards,
  warmScryfallForDeckRows,
} from "@/lib/deck-prefetch-cache"

export type DeckWorkspaceFetchSetters = {
  setAccessDenied: (v: boolean) => void
  setIsOwner: (v: boolean) => void
  setDeck: (v: Deck | null) => void
  setCommanderIds: (v: string[]) => void
  setCoverImageId: (v: string | null) => void
  setPrimerMarkdown: (v: string) => void
  setCards: (v: DeckCard[]) => void
  setCardsLoading: (v: boolean) => void
  setCoverImageUrl: (v: string | null) => void
}

export function useDeckWorkspaceFetch(deckId: string, setters: DeckWorkspaceFetchSetters) {
  const settersRef = useRef(setters)

  useLayoutEffect(() => {
    settersRef.current = setters
  })

  const fetchGenRef = useRef(0)

  const fetchDeck = useCallback(async () => {
    const {
      setAccessDenied,
      setIsOwner,
      setDeck,
      setCommanderIds,
      setCoverImageId,
      setPrimerMarkdown,
      setCards,
      setCardsLoading,
      setCoverImageUrl,
    } = settersRef.current

    const gen = ++fetchGenRef.current

    const [userResult, deckResult, cardsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("decks").select("*").eq("id", deckId).maybeSingle(),
      supabase.from("deck_cards").select("*").eq("deck_id", deckId),
    ])

    const viewerId = userResult.data.user?.id ?? null
    const { data: deckData, error: deckError } = deckResult

    if (deckError || !deckData) {
      setAccessDenied(true)
      return
    }
    if (gen !== fetchGenRef.current) return
    setAccessDenied(false)

    const owner = !!viewerId && deckData.user_id === viewerId
    setIsOwner(owner)
    setDeck(deckData)
    setCommanderIds(deckData.commander_scryfall_ids || [])
    setCoverImageId(deckData.cover_image_scryfall_id || null)
    setPrimerMarkdown(deckData.primer_markdown || "")

    const { data: cardsData, error: cardsError } = cardsResult

    if (cardsError) {
      toast.error("Failed to load cards")
      return
    }

    if (cardsData) {
      storePrefetchedDeckCards(deckId, cardsData)
      const prefetchedRows = getPrefetchedDeckCards(deckId, 120_000)
      if (prefetchedRows?.length) {
        warmScryfallForDeckRows(deckData, prefetchedRows)
      }

      const idsToFetch = new Set<string>()
      for (const c of cardsData) idsToFetch.add(c.printing_scryfall_id || c.scryfall_id)
      if (deckData.cover_image_scryfall_id) idsToFetch.add(deckData.cover_image_scryfall_id)

      const sfCards = await getCardsByIds(Array.from(idsToFetch))
      if (gen !== fetchGenRef.current) return
      const sfMap = new Map(sfCards.map((c) => [c.id, c]))

      const hydrated: DeckCard[] = cardsData.map((c) => {
        const baseSf = sfMap.get(c.scryfall_id)
        const oracleId = c.oracle_id ?? baseSf?.oracle_id ?? null
        const effectiveId = c.printing_scryfall_id || c.scryfall_id
        const effSf = sfMap.get(effectiveId) ?? baseSf
        const finish = (c.finish ?? "nonfoil") as "nonfoil" | "foil" | "etched"
        const faceImages = getCardFaceImages(effSf)
        const faceRules = getCardFaceRulesFields(effSf)
        return {
          ...c,
          oracle_id: oracleId,
          finish,
          printing_scryfall_id: c.printing_scryfall_id ?? null,
          image_url: getCardImageUrl(effSf),
          face_images: faceImages,
          face_rules: faceRules,
          type_line: effSf?.type_line || "",
          mana_cost: effSf?.mana_cost || "",
          cmc: cmcOf(effSf),
          colors: effSf?.colors ?? [],
          color_identity: effSf?.color_identity ?? [],
          legalities: effSf?.legalities,
          oracle_text: rulesTextForDisplay(effSf),
          produced_mana: effSf?.produced_mana ?? [],
          set_code: effSf?.set,
          collector_number: effSf?.collector_number,
          available_finishes: effSf?.finishes,
          price_usd: pickPrice(effSf?.prices, finish),
          rarity: effSf?.rarity,
          effective_printing_id: effectiveId,
        }
      })

      setCards(hydrated)
      setCardsLoading(false)

      const coverId = deckData.cover_image_scryfall_id || null
      if (coverId) {
        const inDeck = sfMap.get(coverId)
        const inDeckCoverUrl = getCardImageUrl(inDeck)
        if (inDeckCoverUrl) setCoverImageUrl(inDeckCoverUrl)
        else {
          const fetched = await getCard(coverId)
          if (gen === fetchGenRef.current) setCoverImageUrl(getCardImageUrl(fetched) ?? null)
        }
      } else {
        setCoverImageUrl(null)
      }
    }
  }, [deckId])

  useEffect(() => {
    void Promise.resolve().then(() => void fetchDeck())
    const channel = supabase
      .channel(`deck-workspace:${deckId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decks", filter: `id=eq.${deckId}` }, () => {
        void fetchDeck()
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deck_cards", filter: `deck_id=eq.${deckId}` },
        () => {
          void fetchDeck()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [deckId, fetchDeck])

  return { fetchDeck, fetchGenRef }
}
