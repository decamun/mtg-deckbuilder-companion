"use client"

import { useEffect, useRef, useState } from "react"
import { BrewSection } from "@/components/BrewSection"
import { BrowseSection } from "@/components/BrowseSection"
import { BlogSection } from "@/components/BlogSection"
import { DecksSection } from "@/components/DecksSection"
import { supabase } from "@/lib/supabase/client"

const SECTION_PATHS: Record<string, string> = {
  brew: "/brew",
  decks: "/decks",
  browse: "/browse",
  blog: "/blog",
}

interface Props {
  initialSection: "brew" | "decks" | "browse" | "blog"
}

export function ScrollShell({ initialSection }: Props) {
  const brewRef = useRef<HTMLElement>(null)
  const decksRef = useRef<HTMLElement>(null)
  const browseRef = useRef<HTMLElement>(null)
  const blogRef = useRef<HTMLElement>(null)
  // Start false — decks section is hidden until we confirm a live session.
  // This matches the nav tab behaviour and avoids any flash for logged-out users.
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const prevIsAuth = useRef(false)
  const initialScrollDone = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session?.user)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  // When the user logs out, scroll back to brew so they aren't left viewing
  // a now-unmounted section.
  useEffect(() => {
    if (prevIsAuth.current && !isAuthenticated) {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    prevIsAuth.current = isAuthenticated
  }, [isAuthenticated])

  // Jump to the requested section after hydration. For the decks section we
  // wait until auth is confirmed (it only mounts once authenticated).
  useEffect(() => {
    if (initialScrollDone.current) return
    if (initialSection === "brew") {
      initialScrollDone.current = true
      return
    }
    if (initialSection === "decks" && !isAuthenticated) return

    const refMap = { decks: decksRef, browse: browseRef, blog: blogRef }
    const el = refMap[initialSection as "decks" | "browse" | "blog"].current
    if (!el) return

    initialScrollDone.current = true
    const top = el.getBoundingClientRect().top + window.scrollY - 56
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" })
  }, [initialSection, isAuthenticated])

  // Update the URL and fire a nav event as the user scrolls between sections.
  // rootMargin "-50% 0px -50% 0px" creates a 1px detection line at the
  // viewport center so only the section currently occupying that center fires.
  // Re-runs when auth changes so newly mounted/unmounted sections are observed.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const path = SECTION_PATHS[entry.target.id]
            if (path) {
              window.history.replaceState(null, "", path)
              window.dispatchEvent(
                new CustomEvent("sectionchange", { detail: { path } })
              )
            }
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    )

    for (const ref of [brewRef, decksRef, browseRef, blogRef]) {
      if (ref.current) obs.observe(ref.current)
    }

    return () => obs.disconnect()
  }, [isAuthenticated])

  return (
    <div className="flex flex-1 flex-col">
      <section
        id="brew"
        ref={brewRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col border-b border-border"
      >
        <BrewSection />
      </section>

      {isAuthenticated && (
        <section
          id="decks"
          ref={decksRef}
          className="flex min-h-[calc(100vh-3.5rem)] flex-col border-b border-border"
        >
          <DecksSection />
        </section>
      )}

      <section
        id="browse"
        ref={browseRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col border-b border-border"
      >
        <BrowseSection />
      </section>

      <section
        id="blog"
        ref={blogRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col"
      >
        <BlogSection />
      </section>
    </div>
  )
}
