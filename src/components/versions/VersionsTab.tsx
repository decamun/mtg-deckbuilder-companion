"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  createNamedVersion,
  getVersions,
  setVersionBookmark,
  revertToVersion,
  type DeckVersionRow,
} from "@/lib/versions"
import { supabase } from "@/lib/supabase/client"
import { VersionTimelineRow } from "./VersionTimelineRow"
import { UnnamedVersionsGroup } from "./UnnamedVersionsGroup"
import { AddNamedVersionDialog } from "./AddNamedVersionDialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Props {
  deckId: string
  isOwner: boolean
  onViewVersion: (versionId: string) => void
  onReverted: () => void
}

export function VersionsTab({ deckId, isOwner, onViewVersion, onReverted }: Props) {
  const [rows, setRows] = useState<DeckVersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [revertTargetId, setRevertTargetId] = useState<string | null>(null)
  const [reverting, setReverting] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setRows(await getVersions(deckId))
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(refresh)
    const ch = supabase.channel(`deck-versions-${deckId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deck_versions", filter: `deck_id=eq.${deckId}` }, () => {
        void refresh()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
    // refresh intentionally reads the current deck id; resubscribe only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const bookmarked = useMemo(() => rows.filter(r => r.is_bookmarked && r.name), [rows])

  // Build timeline groups: named versions are top-level rows; unnamed rows
  // between two named anchors are bucketed into a collapsed group.
  const groups = useMemo(() => {
    type Group = { kind: "named"; row: DeckVersionRow } | { kind: "unnamed"; rows: DeckVersionRow[] }
    const out: Group[] = []
    let bucket: DeckVersionRow[] = []
    for (const r of rows) {
      if (r.name) {
        if (bucket.length) { out.push({ kind: "unnamed", rows: bucket }); bucket = [] }
        out.push({ kind: "named", row: r })
      } else {
        bucket.push(r)
      }
    }
    if (bucket.length) out.push({ kind: "unnamed", rows: bucket })
    return out
  }, [rows])

  const handleAddNamed = async (name: string, isBookmarked: boolean) => {
    const created = await createNamedVersion(deckId, name, isBookmarked)
    if (!created) toast.error("Failed to create version")
    else {
      toast.success("Version saved")
      void refresh()
    }
  }

  const handleToggleBookmark = async (row: DeckVersionRow) => {
    await setVersionBookmark(row.id, !row.is_bookmarked)
    void refresh()
  }

  const performRevert = async () => {
    if (!revertTargetId) return
    setReverting(true)
    const ok = await revertToVersion(deckId, revertTargetId)
    setReverting(false)
    if (!ok) {
      toast.error("Revert failed")
      return
    }
    toast.success("Reverted")
    setRevertTargetId(null)
    onReverted()
    void refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Versions</h2>
        {isOwner && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add named version
          </Button>
        )}
      </div>

      {bookmarked.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Bookmarked</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {bookmarked.map(r => (
              <VersionTimelineRow
                key={r.id}
                row={r}
                isOwner={isOwner}
                onView={() => onViewVersion(r.id)}
                onToggleBookmark={() => handleToggleBookmark(r)}
                onRevert={() => setRevertTargetId(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Timeline</h3>
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            No versions yet. Edits to this deck will appear here automatically.
          </div>
        )}
        <div className="space-y-2">
          {groups.map((g, i) =>
            g.kind === "named" ? (
              <VersionTimelineRow
                key={g.row.id}
                row={g.row}
                isOwner={isOwner}
                onView={() => onViewVersion(g.row.id)}
                onToggleBookmark={() => handleToggleBookmark(g.row)}
                onRevert={() => setRevertTargetId(g.row.id)}
              />
            ) : (
              <UnnamedVersionsGroup
                key={`u-${i}`}
                rows={g.rows}
                isOwner={isOwner}
                onView={onViewVersion}
                onToggleBookmark={handleToggleBookmark}
                onRevert={setRevertTargetId}
              />
            )
          )}
        </div>
      </section>

      <AddNamedVersionDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddNamed} />
      <Dialog open={!!revertTargetId} onOpenChange={(open) => { if (!open && !reverting) setRevertTargetId(null) }}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Revert deck?</DialogTitle>
            <DialogDescription>
              Your current deck state will be saved as a new version before this version is restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevertTargetId(null)} disabled={reverting}>Cancel</Button>
            <Button onClick={performRevert} disabled={reverting}>{reverting ? "Reverting..." : "Revert deck"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
