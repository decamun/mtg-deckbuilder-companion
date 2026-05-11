"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DeckBranchRow } from "@/lib/deck-branches"
import {
  buildMergedSnapshot,
  collectAllMergeConflicts,
  defaultConflictChoices,
  type ConflictChoices,
  type DeckMergeConflict,
  findMergeBaseVersionId,
  getSnapshotAtVersionId,
  type MergeSide,
} from "@/lib/deck-branch-merge"
import { applyMergedSnapshot } from "@/lib/deck-branches"
import { getDeckVersionAncestry } from "@/lib/versions"
import type { VersionSnapshot } from "@/lib/versions"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  deckId: string
  branches: DeckBranchRow[]
  currentBranchId: string
  sourceBranch: DeckBranchRow | null
  onMerged: () => void
}

function conflictTitle(c: DeckMergeConflict): string {
  if (c.kind === "primer") return "Primer"
  if (c.kind === "deck_meta") return "Deck metadata"
  return c.ours?.card.name ?? c.theirs?.card.name ?? "Card row"
}

export function BranchMergeDialog({
  open,
  onOpenChange,
  deckId,
  branches,
  currentBranchId,
  sourceBranch,
  onMerged,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [ancestry, setAncestry] = useState<{ id: string; parent_id: string | null; snapshot: VersionSnapshot }[]>([])
  const [conflicts, setConflicts] = useState<DeckMergeConflict[]>([])
  const [choices, setChoices] = useState<ConflictChoices>({})

  const destBr = useMemo(
    () => branches.find((b) => b.id === currentBranchId) ?? null,
    [branches, currentBranchId]
  )

  useEffect(() => {
    if (!open || !sourceBranch || !destBr?.head_version_id || !sourceBranch.head_version_id) {
      void Promise.resolve().then(() => {
        setConflicts([])
        setChoices({})
      })
      return
    }
    void (async () => {
      const rows = await getDeckVersionAncestry(deckId)
      setAncestry(rows)
      const lca = findMergeBaseVersionId(rows, destBr.head_version_id!, sourceBranch.head_version_id!)
      const base = getSnapshotAtVersionId(rows, lca)
      const destSnap = rows.find((r) => r.id === destBr.head_version_id)?.snapshot
      const srcSnap = rows.find((r) => r.id === sourceBranch.head_version_id)?.snapshot
      if (!destSnap || !srcSnap) {
        setConflicts([])
        return
      }
      const list = collectAllMergeConflicts(base, destSnap, srcSnap)
      setConflicts(list)
      setChoices(defaultConflictChoices(list, "ours"))
    })()
  }, [open, deckId, sourceBranch, destBr?.head_version_id])

  const mergedPreview = useMemo(() => {
    if (!sourceBranch || !destBr?.head_version_id || !sourceBranch.head_version_id) return null
    const destSnap = ancestry.find((r) => r.id === destBr.head_version_id)?.snapshot
    const srcSnap = ancestry.find((r) => r.id === sourceBranch.head_version_id)?.snapshot
    if (!destSnap || !srcSnap) return null
    const lca = findMergeBaseVersionId(ancestry, destBr.head_version_id, sourceBranch.head_version_id)
    const base = getSnapshotAtVersionId(ancestry, lca)
    try {
      return buildMergedSnapshot(base, destSnap, srcSnap, choices)
    } catch {
      return null
    }
  }, [ancestry, choices, destBr, sourceBranch])

  const setSide = (id: string, side: MergeSide) => {
    setChoices((prev) => ({ ...prev, [id]: side }))
  }

  const setAll = (side: MergeSide) => {
    setChoices(defaultConflictChoices(conflicts, side))
  }

  const submit = async () => {
    if (!mergedPreview || !sourceBranch || !destBr) return
    setLoading(true)
    const ok = await applyMergedSnapshot(
      deckId,
      mergedPreview,
      `Merged branch "${sourceBranch.name}" into "${destBr.name}"`
    )
    setLoading(false)
    if (!ok) {
      toast.error("Merge failed")
      return
    }
    toast.success("Merge complete")
    onOpenChange(false)
    onMerged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] border border-border bg-card text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge branch</DialogTitle>
          <DialogDescription>
            Resolve conflicts between <span className="font-medium text-foreground">{destBr?.name ?? "…"}</span>{" "}
            (current) and <span className="font-medium text-foreground">{sourceBranch?.name ?? "…"}</span>. Checked
            means prefer the incoming branch for that row.
          </DialogDescription>
        </DialogHeader>

        {conflicts.length === 0 && sourceBranch && destBr?.head_version_id && sourceBranch.head_version_id && (
          <p className="text-sm text-muted-foreground">No conflicts — branches can be merged automatically.</p>
        )}

        {conflicts.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAll("theirs")}>
                Check all (incoming)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAll("ours")}>
                Uncheck all (current)
              </Button>
            </div>
            <ScrollArea className="max-h-[320px] rounded-md border border-border pr-3">
              <ul className="space-y-3 py-2">
                {conflicts.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                    <input
                      id={c.id}
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={choices[c.id] === "theirs"}
                      onChange={(e) => setSide(c.id, e.target.checked ? "theirs" : "ours")}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={c.id} className="cursor-pointer text-sm font-medium leading-none">
                        {conflictTitle(c)}
                      </Label>
                      {c.kind === "card" && (
                        <p className="text-xs text-muted-foreground">
                          Current: {c.ours ? `${c.ours.quantity}× ${c.ours.card.name}` : "—"} · Incoming:{" "}
                          {c.theirs ? `${c.theirs.quantity}× ${c.theirs.card.name}` : "—"}
                        </p>
                      )}
                      {c.kind === "primer" && (
                        <p className="text-xs text-muted-foreground">Both branches changed the primer.</p>
                      )}
                      {c.kind === "deck_meta" && (
                        <p className="text-xs text-muted-foreground">Name, format, commanders, or other metadata differ.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={loading || !mergedPreview}>
            {loading ? "Merging…" : "Apply merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
