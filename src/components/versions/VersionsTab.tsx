"use client"

import { useEffect, useMemo, useState } from "react"
import { GitCompare, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  createNamedVersion,
  getVersions,
  setVersionBookmark,
  setVersionTags,
  revertToVersion,
  type DeckVersionRow,
} from "@/lib/versions"
import { supabase } from "@/lib/supabase/client"
import { VersionTimelineRow } from "./VersionTimelineRow"
import { UnnamedVersionsGroup } from "./UnnamedVersionsGroup"
import { AddNamedVersionDialog } from "./AddNamedVersionDialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  deckId: string
  isOwner: boolean
  onViewVersion: (versionId: string) => void
  onDiffWithVersion: (versionId: string, label: string) => void
  onReverted: () => void
}

const BUILT_IN_VERSION_TAGS = ["paper-build"]

const tagLabel = (tag: string) => tag === "paper-build" ? "Paper build" : tag

export function VersionsTab({ deckId, isOwner, onViewVersion, onDiffWithVersion, onReverted }: Props) {
  const [rows, setRows] = useState<DeckVersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [revertTargetId, setRevertTargetId] = useState<string | null>(null)
  const [tagTarget, setTagTarget] = useState<DeckVersionRow | null>(null)
  const [customTag, setCustomTag] = useState("")
  const [savingTag, setSavingTag] = useState(false)
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
  const knownTags = useMemo(() => {
    const tags = new Set(BUILT_IN_VERSION_TAGS)
    rows.forEach(row => (row.tags ?? []).forEach(tag => tags.add(tag)))
    return Array.from(tags).sort((a, b) => {
      if (a === "paper-build") return -1
      if (b === "paper-build") return 1
      return a.localeCompare(b)
    })
  }, [rows])
  const latestByTag = useMemo(() => {
    const byTag = new Map<string, DeckVersionRow>()
    for (const row of rows) {
      for (const tag of row.tags ?? []) {
        if (!byTag.has(tag)) byTag.set(tag, row)
      }
    }
    return byTag
  }, [rows])

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

  const handleToggleTag = async (row: DeckVersionRow, tag: string) => {
    const tags = row.tags ?? []
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    await setVersionTags(row.id, next)
    toast.success(tags.includes(tag) ? `Removed ${tagLabel(tag)}` : `Marked as ${tagLabel(tag)}`)
    void refresh()
  }

  const submitCustomTag = async () => {
    if (!tagTarget) return
    const tag = customTag.trim()
    if (!tag) return
    setSavingTag(true)
    await setVersionTags(tagTarget.id, [...(tagTarget.tags ?? []), tag])
    setSavingTag(false)
    toast.success(`Marked as ${tagLabel(tag)}`)
    setTagTarget(null)
    setCustomTag("")
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Versions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={knownTags.every(tag => !latestByTag.has(tag))} />}>
              <GitCompare className="w-3.5 h-3.5 mr-1.5" /> View diff with...
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover border-border text-foreground">
              <DropdownMenuItem
                disabled={!latestByTag.get("paper-build")}
                onClick={() => {
                  const row = latestByTag.get("paper-build")
                  if (row) onDiffWithVersion(row.id, `Latest ${tagLabel("paper-build")}`)
                }}
              >
                Latest paper-build
              </DropdownMenuItem>
              {knownTags.filter(tag => tag !== "paper-build").length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {knownTags.filter(tag => tag !== "paper-build").map(tag => {
                    const row = latestByTag.get(tag)
                    return (
                      <DropdownMenuItem
                        key={tag}
                        disabled={!row}
                        onClick={() => { if (row) onDiffWithVersion(row.id, `Latest ${tagLabel(tag)}`) }}
                      >
                        Latest {tagLabel(tag)}
                      </DropdownMenuItem>
                    )
                  })}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {isOwner && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add named version
            </Button>
          )}
        </div>
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
                knownTags={knownTags}
                onView={() => onViewVersion(r.id)}
                onToggleBookmark={() => handleToggleBookmark(r)}
                onToggleTag={(tag) => handleToggleTag(r, tag)}
                onAddTag={() => setTagTarget(r)}
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
                knownTags={knownTags}
                onView={() => onViewVersion(g.row.id)}
                onToggleBookmark={() => handleToggleBookmark(g.row)}
                onToggleTag={(tag) => handleToggleTag(g.row, tag)}
                onAddTag={() => setTagTarget(g.row)}
                onRevert={() => setRevertTargetId(g.row.id)}
              />
            ) : (
              <UnnamedVersionsGroup
                key={`u-${i}`}
                rows={g.rows}
                isOwner={isOwner}
                knownTags={knownTags}
                onView={onViewVersion}
                onToggleBookmark={handleToggleBookmark}
                onToggleTag={handleToggleTag}
                onAddTag={(row) => setTagTarget(row)}
                onRevert={setRevertTargetId}
              />
            )
          )}
        </div>
      </section>

      <AddNamedVersionDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddNamed} />
      <Dialog open={!!tagTarget} onOpenChange={(open) => { if (!open && !savingTag) { setTagTarget(null); setCustomTag("") } }}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add version tag</DialogTitle>
            <DialogDescription>
              Tags can identify paper builds, playtest snapshots, or other version milestones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="version-tag">Tag</Label>
            <Input
              id="version-tag"
              value={customTag}
              onChange={(event) => setCustomTag(event.target.value)}
              placeholder="e.g. tournament-list"
              className="bg-background/50 border-border"
              onKeyDown={(event) => { if (event.key === "Enter") void submitCustomTag() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTagTarget(null); setCustomTag("") }} disabled={savingTag}>Cancel</Button>
            <Button onClick={submitCustomTag} disabled={savingTag || !customTag.trim()}>{savingTag ? "Saving..." : "Save tag"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
