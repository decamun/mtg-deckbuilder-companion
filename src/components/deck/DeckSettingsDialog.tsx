"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { recordVersion } from "@/lib/versions"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BRACKET_LABELS, type Bracket } from "@/lib/game-changers"

interface Props {
  deckId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: {
    name: string
    description: string | null
    format: string | null
    budget_usd?: number | string | null
    bracket?: number | null
    is_public: boolean
  }
  onSaved: (next: { name: string; description: string | null; format: string | null; budget_usd: number | null; bracket: number | null; is_public: boolean }) => void
}

export function DeckSettingsDialog({ deckId, open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? "")
  const [format, setFormat] = useState(initial.format ?? "edh")
  const [budget, setBudget] = useState(initial.budget_usd == null ? "" : String(initial.budget_usd))
  const [bracket, setBracket] = useState(initial.bracket == null ? "none" : String(initial.bracket))
  const [isPublic, setIsPublic] = useState(initial.is_public)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        setName(initial.name)
        setDescription(initial.description ?? "")
        setFormat(initial.format ?? "edh")
        setBudget(initial.budget_usd == null ? "" : String(initial.budget_usd))
        setBracket(initial.bracket == null ? "none" : String(initial.bracket))
        setIsPublic(initial.is_public)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [open, initial])

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    const budgetUsd =
      budget.trim() === "" ? null : Math.max(0, Number.parseFloat(budget))
    if (budgetUsd !== null && !Number.isFinite(budgetUsd)) {
      toast.error("Budget must be a valid number")
      return
    }
    setSaving(true)
    const versionSince = new Date().toISOString()
    const patch = {
      name: name.trim(),
      description: description.trim() || null,
      format,
      budget_usd: budgetUsd,
      bracket: bracket === "none" ? null : Number(bracket),
      is_public: isPublic,
    }
    const { error } = await supabase.from("decks").update(patch).eq("id", deckId)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    const changes: string[] = []
    if (patch.name !== initial.name) changes.push(`renamed to "${patch.name}"`)
    if ((patch.description ?? "") !== (initial.description ?? "")) changes.push("updated description")
    if (patch.format !== initial.format) changes.push(`changed format to ${patch.format}`)
    if (patch.budget_usd !== (initial.budget_usd ?? null)) changes.push("updated budget")
    if (patch.bracket !== (initial.bracket ?? null)) changes.push(`changed bracket to ${patch.bracket ?? "none"}`)
    if (patch.is_public !== initial.is_public) changes.push(patch.is_public ? "made public" : "made private")
    if (changes.length > 0) recordVersion(deckId, changes.join("; "), versionSince)

    onSaved(patch)
    onOpenChange(false)
    toast.success("Settings saved")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border border-border text-foreground sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Deck Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <div className="space-y-2">
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" value={name} onChange={e => setName(e.target.value)} className="bg-background/50 border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-desc">Description</Label>
            <Textarea
              id="ds-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-background/50 border-border min-h-[80px]"
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={v => v && setFormat(v)}>
              <SelectTrigger className="bg-background/50 border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="edh">EDH / Commander</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="pioneer">Pioneer</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="vintage">Vintage</SelectItem>
                <SelectItem value="pauper">Pauper</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ds-budget">Budget (USD)</Label>
              <Input
                id="ds-budget"
                type="number"
                min={0}
                step={1}
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="bg-background/50 border-border"
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Bracket</Label>
              <Select value={bracket} onValueChange={v => v && setBracket(v)}>
                <SelectTrigger className="bg-background/50 border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="none">Not set</SelectItem>
                  {([1, 2, 3, 4, 5] as Bracket[]).map(value => (
                    <SelectItem key={value} value={String(value)}>
                      {value} - {BRACKET_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  isPublic ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">Public</div>
                <div className="text-xs opacity-70">Anyone with the link can view</div>
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  !isPublic ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">Private</div>
                <div className="text-xs opacity-70">Only you can view</div>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
