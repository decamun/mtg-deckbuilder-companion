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

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/brew")
  }

  const navLinks = [
    { href: "/brew", label: "Brew", alwaysShow: true },
    { href: "/decks", label: "Your Decks", alwaysShow: false },
  ]

  const visibleLinks = navLinks.filter((l) => l.alwaysShow || user)

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo & name */}
        <Link
          href={user ? "/decks" : "/brew"}
          className="flex shrink-0 items-center gap-2.5"
        >
          <IdlebrewLogo className="h-7 w-auto text-foreground" />
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            idlebrew
          </span>
        </Link>

        {/* Center nav links */}
        <nav className="flex items-center gap-1">
          {visibleLinks.map(({ href, label }) => {
            const isActive =
              pathname === href ||
              (href !== "/" && pathname.startsWith(href + "/"))
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
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

        {/* Right: user dropdown */}
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
              <DropdownMenuItem onClick={() => router.push("/login")}>
                Log In
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
