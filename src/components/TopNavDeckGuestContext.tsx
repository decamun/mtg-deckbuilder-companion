"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type TopNavDeckGuestContextValue = {
  /** True while viewing /decks/[id] as a non-owner — Browse should win over Your Decks in the nav. */
  guestDeckNav: boolean
  setGuestDeckNav: (value: boolean) => void
}

const TopNavDeckGuestContext = createContext<TopNavDeckGuestContextValue | null>(null)

export function TopNavDeckGuestProvider({ children }: { children: ReactNode }) {
  const [guestDeckNav, setGuestDeckNavState] = useState(false)
  const setGuestDeckNav = useCallback((value: boolean) => {
    setGuestDeckNavState(value)
  }, [])
  const value = useMemo(
    () => ({
      guestDeckNav,
      setGuestDeckNav,
    }),
    [guestDeckNav, setGuestDeckNav],
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
