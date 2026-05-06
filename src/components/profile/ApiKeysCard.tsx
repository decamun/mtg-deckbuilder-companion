"use client"

import { useEffect, useState } from "react"
import { Copy, KeyRound, Trash2, Plus, Check, ExternalLink } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

interface CreatedKey {
  id: string
  name: string
  key_prefix: string
  created_at: string
  key: string
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never"
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    try {
      const res = await fetch("/api/keys", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiKeyRow[]
      setKeys(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load keys"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/keys", { credentials: "include" })
        if (cancelled) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as ApiKeyRow[]
        if (!cancelled) setKeys(data)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : "Failed to load keys"
        toast.error(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error("Name is required")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      const body = (await res.json()) as CreatedKey
      setCreated(body)
      setCreateOpen(false)
      setNewName("")
      void refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create key"
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this key? Connected agents will lose access immediately.")) return
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      toast.success("Key revoked")
      void refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to revoke key"
      toast.error(msg)
    }
  }

  const handleCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Copy failed — select the key manually and copy with Ctrl+C")
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                API keys (MCP)
              </CardTitle>
              <CardDescription>
                Use these keys to connect Claude Desktop, Cursor, or any other MCP-aware
                agent to your decks. Each key acts as you.
              </CardDescription>
              <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <p className="mb-1 text-muted-foreground">MCP server URL</p>
                <code className="break-all font-mono text-foreground">
                  https://idlebrew.com/api/mcp
                </code>
              </div>
              <Link
                href="/blog/connecting-idlebrew-mcp"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                How to connect Claude Desktop &amp; Cursor
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No keys yet. Create one to start using the MCP server.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{k.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {k.key_prefix}…
                      <span className="mx-2">·</span>
                      created {formatTimestamp(k.created_at)}
                      <span className="mx-2">·</span>
                      last used {formatTimestamp(k.last_used_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRevoke(k.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Pick a recognizable name. The key will be shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Claude Desktop — laptop"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) void handleCreate()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!created}
        onOpenChange={(open) => {
          if (!open) setCreated(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save your key — it won&apos;t be shown again</DialogTitle>
            <DialogDescription>
              Copy this now. We only store a hash, so we can&apos;t recover it later.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {created.name}
                </p>
                <code className="block break-all font-mono text-sm text-foreground">
                  {created.key}
                </code>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleCopy()}
                className="w-full"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy key
                  </>
                )}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
