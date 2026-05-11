"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSubmit: (name: string) => Promise<void>
}

export function NewBranchDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setName("")
    onOpenChange(nextOpen)
  }

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSubmit(name.trim())
    setSaving(false)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border border-border text-foreground sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New branch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="bname">Branch name</Label>
            <Input
              id="bname"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. combo-package"
              className="bg-background/50 border-border"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
