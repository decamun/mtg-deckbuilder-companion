"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { IdlebrewLogo } from "@/components/IdlebrewLogo"
import { supabase } from "@/lib/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { User, LogOut, ChevronDown, Settings, Heart } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { LoginDialog } from "@/components/LoginDialog"
import { useTopNavDeckGuest } from "@/components/TopNavDeckGuestContext"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/brew", label: "Brew", requiresAuth: false },
  { href: "/decks", label: "Your Decks", requiresAuth: true },
  { href: "/browse", label: "Browse", requiresAuth: false },
  { href: "/blog", label: "Blog", requiresAuth: false },
]

// Paths that render the scroll shell — clicking their nav links scrolls
// in-page rather than triggering a full navigation.
const SHELL_PATHS = new Set(["/brew", "/decks", "/browse", "/blog"])

/** Single-segment /decks/[x] routes: deck workspace UUID paths, not /decks/liked. */
function isDeckWorkspacePath(path: string) {
  const seg = path.match(/^\/decks\/([^/]+)$/)?.[1]
  return seg != null && seg !== "liked"
}

function navLinkIsActive(
  href: string,
  activePath: string,
  guestDeckNav: boolean,
): boolean {
  if (href === "/decks") {
    if (activePath === "/decks") return true
    if (activePath.startsWith("/decks/liked")) return true
    if (isDeckWorkspacePath(activePath) && !guestDeckNav) return true
    return false
  }
  if (href === "/browse") {
    if (activePath === "/browse" || activePath.startsWith("/browse/")) return true
    if (isDeckWorkspacePath(activePath) && guestDeckNav) return true
    return false
  }
  return activePath === href || (href !== "/" && activePath.startsWith(href + "/"))
}

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { guestDeckNav, deckEditorScrollCompact } = useTopNavDeckGuest()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const currentPath = pathname ?? ""
  const navBarCompact =
    isDeckWorkspacePath(currentPath) && deckEditorScrollCompact
  const [visiblePath, setVisiblePath] = useState<string | null>(null)
  const isScrollShellPage = SHELL_PATHS.has(currentPath)
  const activePath = isScrollShellPage ? visiblePath ?? currentPath : currentPath
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      setVisiblePath(path)
    }
    window.addEventListener("sectionchange", handler)
    return () => window.removeEventListener("sectionchange", handler)
  }, [])

  useEffect(() => {
    const handler = () => setLoginOpen(true)
    window.addEventListener("open-login-dialog", handler)
    return () => window.removeEventListener("open-login-dialog", handler)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setLoginOpen(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/brew")
  }

  // Scroll to a shell section accounting for the sticky navbar height.
  // Brew is always at the very top (scrollTop 0); other sections use their
  // document offset minus the 56px navbar so content isn't hidden behind it.
  const scrollToSection = (id: string, behavior: ScrollBehavior = "smooth") => {
    if (id === "brew") {
      window.scrollTo({ top: 0, behavior })
      return
    }
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 56
    window.scrollTo({ top: Math.max(0, top), behavior })
  }

  // When already inside the scroll shell, intercept nav clicks and scroll
  // in-page instead of navigating (which would cause a full re-render).
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (isScrollShellPage && SHELL_PATHS.has(href)) {
      e.preventDefault()
      scrollToSection(href.slice(1))
    }
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    if (isScrollShellPage) {
      e.preventDefault()
      scrollToSection("brew")
    }
  }

  return (
    <>
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div
        className={cn(
          "container mx-auto flex items-center gap-2 px-4 pt-safe transition-[height,min-height] duration-200 ease-out sm:gap-6",
          navBarCompact ? "h-7 min-h-7" : "h-14 min-h-14",
        )}
      >
        {/* Logo & name — always anchored left */}
        <Link
          href="/brew"
          onClick={handleLogoClick}
          className={cn(
            "flex shrink-0 items-center",
            navBarCompact ? "gap-1.5" : "gap-2.5",
          )}
        >
          <IdlebrewLogo
            className={cn(
              "w-auto text-foreground transition-[height] duration-200 ease-out",
              navBarCompact ? "h-4" : "h-7",
            )}
          />
          <span
            className={cn(
              "font-heading font-bold tracking-tight text-foreground",
              navBarCompact
                ? "hidden"
                : "hidden text-lg sm:inline",
            )}
          >
            idlebrew
          </span>
        </Link>

        {/*
          Many primary links on a narrow bar: keep a single horizontal scroller (`flex-nowrap`) so the logo
          and account menu stay visible (issue #226).
        */}
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin] md:flex-none md:overflow-visible">
          <nav className="flex flex-nowrap items-center gap-0.5 sm:gap-1">
            {NAV_LINKS.filter((link) => !link.requiresAuth || user).map(
              ({ href, label }) => {
                const isActive = navLinkIsActive(href, activePath, guestDeckNav)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => handleNavClick(e, href)}
                    className={cn(
                      "shrink-0 rounded-md font-medium transition-colors",
                      navBarCompact
                        ? "px-1.5 py-0.5 text-[11px] sm:px-2 sm:text-xs"
                        : "px-2 py-1.5 text-sm sm:px-4",
                      isActive
                        ? "border border-primary/20 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </Link>
                )
              },
            )}
          </nav>
        </div>

        {/* Spacer pushes dropdown to the far right on wide layouts */}
        <div className="hidden flex-1 md:block" />

        {/* User dropdown — always anchored right */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "flex items-center text-muted-foreground hover:text-foreground",
                  navBarCompact
                    ? "h-7 gap-0.5 px-1.5 py-0"
                    : "gap-1.5",
                )}
              />
            }
          >
            <User className={navBarCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            <ChevronDown
              className={cn(
                "opacity-60",
                navBarCompact ? "h-2.5 w-2.5" : "h-3 w-3",
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {user ? (
              <>
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <Settings className="h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/decks/liked")}>
                  <Heart className="h-4 w-4" />
                  Liked decks
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => setLoginOpen(true)}>
                Log In
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  )
}
