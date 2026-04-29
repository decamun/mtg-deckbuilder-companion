"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSubmit: (name: string, bookmarked: boolean) => Promise<void>
}

export function AddNamedVersionDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("")
  const [bookmarked, setBookmarked] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName("")
      setBookmarked(false)
    }
    onOpenChange(nextOpen)
  }

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSubmit(name.trim(), bookmarked)
    setSaving(false)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border border-border text-foreground sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add named version</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="vname">Version name</Label>
            <Input
              id="vname"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pre-Innistrad rebuild"
              className="bg-background/50 border-border"
              onKeyDown={e => { if (e.key === "Enter") void submit() }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={bookmarked}
              onChange={e => setBookmarked(e.target.checked)}
              className="accent-primary"
            />
            Bookmark this version
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
