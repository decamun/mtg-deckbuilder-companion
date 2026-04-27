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
import { User, LogOut, ChevronDown, Settings } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { LoginDialog } from "@/components/LoginDialog"

const NAV_LINKS = [
  { href: "/brew", label: "Brew", requiresAuth: false },
  { href: "/decks", label: "Your Decks", requiresAuth: true },
  { href: "/blog", label: "Blog", requiresAuth: false },
]

// Paths that render the scroll shell — clicking their nav links scrolls
// in-page rather than triggering a full navigation.
const SHELL_PATHS = new Set(["/brew", "/decks", "/blog"])

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [activePath, setActivePath] = useState(pathname ?? "")
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    setActivePath(pathname ?? "")
  }, [pathname])

  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      setActivePath(path)
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

  // When already inside the scroll shell, intercept nav clicks and scroll
  // in-page instead of navigating (which would cause a full re-render).
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (SHELL_PATHS.has(activePath) && SHELL_PATHS.has(href)) {
      e.preventDefault()
      document
        .getElementById(href.slice(1))
        ?.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <>
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center gap-6 px-4">
        {/* Logo & name — always anchored left */}
        <Link
          href="/brew"
          className="flex shrink-0 items-center gap-2.5"
        >
          <IdlebrewLogo className="h-7 w-auto text-foreground" />
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            idlebrew
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, requiresAuth }) => {
            const hidden = requiresAuth && !user
            const isActive =
              activePath === href ||
              (href !== "/" && activePath.startsWith(href + "/"))
            return (
              <Link
                key={href}
                href={href}
                aria-hidden={hidden}
                tabIndex={hidden ? -1 : undefined}
                onClick={(e) => handleNavClick(e, href)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  hidden ? "invisible pointer-events-none" : ""
                } ${
                  isActive
                    ? "border border-primary/20 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Spacer pushes dropdown to the far right */}
        <div className="flex-1" />

        {/* User dropdown — always anchored right */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <User className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {user ? (
              <>
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <Settings className="h-4 w-4" />
                  Profile
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
