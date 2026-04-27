"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Lock, Mail, User, LogOut, Library, Calendar, Save, AlertTriangle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import type { User as SupabaseUser } from "@supabase/supabase-js"

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name && name.trim()) || (email && email.split("@")[0]) || "?"
  const parts = source.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [ready, setReady] = useState(false)
  const [deckCount, setDeckCount] = useState<number | null>(null)

  const [displayName, setDisplayName] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [updatingPassword, setUpdatingPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login")
        return
      }
      setUser(data.user)
      const meta = data.user.user_metadata ?? {}
      setDisplayName(
        (meta.display_name as string) ||
          (meta.full_name as string) ||
          (meta.name as string) ||
          ""
      )
      setReady(true)

      const { count } = await supabase
        .from("decks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user.id)
      setDeckCount(count ?? 0)
    })
  }, [router])

  const provider = (user?.app_metadata?.provider as string) || "email"
  const isPasswordUser = provider === "email"
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null

  const handleSaveName = async () => {
    if (!user) return
    const trimmed = displayName.trim()
    setSavingName(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      })
      if (error) throw error
      toast.success("Display name updated")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update display name"
      toast.error(message)
    } finally {
      setSavingName(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success("Password updated")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update password"
      toast.error(message)
    } finally {
      setUpdatingPassword(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/brew")
  }

  if (!ready || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  const initials = getInitials(displayName, user.email)

  return (
    <main className="container mx-auto max-w-3xl flex-1 px-4 py-10 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card className="bg-card/50 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-5 py-8 sm:flex-row sm:items-center sm:gap-6">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full ring-1 ring-border bg-muted">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName || user.email || "Avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-heading text-2xl font-semibold text-foreground/80">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {displayName || user.email?.split("@")[0] || "Player"}
              </h1>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Signed in with{" "}
                <span className="font-medium text-foreground/80 capitalize">
                  {provider}
                </span>
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="shrink-0"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Decks
              </p>
              <p className="font-heading text-2xl font-semibold text-foreground">
                {deckCount === null ? "—" : deckCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Member since
              </p>
              <p className="truncate font-heading text-base font-semibold text-foreground">
                {formatDate(user.created_at)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Profile
          </CardTitle>
          <CardDescription>
            How your name appears across idlebrew.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                value={user.email ?? ""}
                disabled
                className="bg-background/30 pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Email is managed by your sign-in provider.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveName} disabled={savingName}>
              <Save className="h-4 w-4" />
              {savingName ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isPasswordUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Password
            </CardTitle>
            <CardDescription>
              Choose a strong password — at least 6 characters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleUpdatePassword}
                disabled={updatingPassword || !newPassword || !confirmPassword}
              >
                {updatingPassword ? "Updating…" : "Update password"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and every deck attached to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/data-deletion"
            className="text-sm text-primary hover:underline"
          >
            Request account &amp; data deletion →
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
