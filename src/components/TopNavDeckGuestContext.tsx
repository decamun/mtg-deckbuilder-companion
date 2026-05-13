"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

type TopNavDeckGuestContextValue = {
  /** True while viewing /decks/[id] as a non-owner — Browse should win over Your Decks in the nav. */
  guestDeckNav: boolean
  setGuestDeckNav: (value: boolean) => void
  /**
   * True when the deck editor’s main scroll area is scrolled down — shrinks the site top nav
   * to half height (h-7) and matches the deck workspace `fixed` inset.
   */
  deckEditorScrollCompact: boolean
  setDeckEditorScrollCompact: Dispatch<SetStateAction<boolean>>
}

const TopNavDeckGuestContext = createContext<TopNavDeckGuestContextValue | null>(null)

export function TopNavDeckGuestProvider({ children }: { children: ReactNode }) {
  const [guestDeckNav, setGuestDeckNavState] = useState(false)
  const setGuestDeckNav = useCallback((value: boolean) => {
    setGuestDeckNavState(value)
  }, [])
  const [deckEditorScrollCompact, setDeckEditorScrollCompact] = useState(false)
  const value = useMemo(
    () => ({
      guestDeckNav,
      setGuestDeckNav,
      deckEditorScrollCompact,
      setDeckEditorScrollCompact,
    }),
    [guestDeckNav, setGuestDeckNav, deckEditorScrollCompact],
  )
  return (
    <TopNavDeckGuestContext.Provider value={value}>{children}</TopNavDeckGuestContext.Provider>
  )
}

export function useTopNavDeckGuest() {
  const ctx = useContext(TopNavDeckGuestContext)
  if (!ctx) {
    throw new Error("useTopNavDeckGuest must be used within TopNavDeckGuestProvider")
  }
  return ctx
}
