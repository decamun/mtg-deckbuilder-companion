"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GitBranch, GitCompare, GitMerge, Plus, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  createNamedVersion,
  getLatestVersionIdPerTagForDeck,
  getVersionsForBranch,
  setVersionBookmark,
  setVersionTags,
  revertToVersion,
  type DeckVersionRow,
} from "@/lib/versions"
import { supabase } from "@/lib/supabase/client"
import {
  createBranch,
  deleteBranch,
  listBranches,
  renameBranch,
  switchBranch,
  type DeckBranchRow,
} from "@/lib/deck-branches"
import { ensureDeckBranchDefaults } from "@/lib/ensure-deck-branch-defaults"
import { VersionTimelineRow } from "./VersionTimelineRow"
import { UnnamedVersionsGroup } from "./UnnamedVersionsGroup"
import { AddNamedVersionDialog } from "./AddNamedVersionDialog"
import { NewBranchDialog } from "./NewBranchDialog"
import { BranchMergeDialog } from "./BranchMergeDialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  deckId: string
  isOwner: boolean
  onViewVersion: (versionId: string) => void
  onDiffWithVersion: (versionId: string, label: string) => void
  onReverted: () => void
  onBranchSwitched?: () => void
}

const BUILT_IN_VERSION_TAGS = ["paper-build"]

const tagLabel = (tag: string) => (tag === "paper-build" ? "Paper build" : tag)

export function VersionsTab({
  deckId,
  isOwner,
  onViewVersion,
  onDiffWithVersion,
  onReverted,
  onBranchSwitched,
}: Props) {
  const [rows, setRows] = useState<DeckVersionRow[]>([])
  const [branches, setBranches] = useState<DeckBranchRow[]>([])
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSource, setMergeSource] = useState<DeckBranchRow | null>(null)
  const [revertTargetId, setRevertTargetId] = useState<string | null>(null)
  const [tagTarget, setTagTarget] = useState<DeckVersionRow | null>(null)
  const [customTag, setCustomTag] = useState("")
  const [savingTag, setSavingTag] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [renamingBranch, setRenamingBranch] = useState(false)
  const [renameDraft, setRenameDraft] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [branchIdToDelete, setBranchIdToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const branchSwitchGenRef = useRef(0)
  const [tagTipByTag, setTagTipByTag] = useState<Record<string, string>>({})

  const currentBranch = useMemo(
    () => branches.find((b) => b.id === currentBranchId) ?? null,
    [branches, currentBranchId]
  )

  const deletableBranches = useMemo(
    () => branches.filter((b) => b.name !== "main" && b.id !== currentBranchId),
    [branches, currentBranchId]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const fetchPack = () =>
        Promise.all([
          supabase.from("decks").select("current_branch_id").eq("id", deckId).maybeSingle(),
          listBranches(deckId),
          getLatestVersionIdPerTagForDeck(deckId),
        ] as const)

      let [{ data: deckRow }, branchList, tagMap] = await fetchPack()

      if (isOwner && (branchList.length === 0 || !(deckRow?.current_branch_id as string | undefined))) {
        const ok = await ensureDeckBranchDefaults(deckId)
        if (ok) {
          ;[{ data: deckRow }, branchList, tagMap] = await fetchPack()
        }
      }

      setTagTipByTag(Object.fromEntries(tagMap))
      const bid = (deckRow?.current_branch_id as string | undefined) ?? null
      setCurrentBranchId(bid)
      setBranches(branchList)
      if (bid) {
        setRows(await getVersionsForBranch(deckId, bid))
      } else {
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [deckId, isOwner])

  useEffect(() => {
    void Promise.resolve().then(() => refresh())
    const ch = supabase
      .channel(`deck-versions-${deckId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deck_versions", filter: `deck_id=eq.${deckId}` }, () => {
        void refresh()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deck_branches", filter: `deck_id=eq.${deckId}` }, () => {
        void refresh()
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "decks", filter: `id=eq.${deckId}` }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [deckId, refresh])

  const bookmarked = useMemo(() => rows.filter((r) => r.is_bookmarked && r.name), [rows])
  const knownTags = useMemo(() => {
    const tags = new Set(BUILT_IN_VERSION_TAGS)
    rows.forEach((row) => (row.tags ?? []).forEach((tag) => tags.add(tag)))
    return Array.from(tags).sort((a, b) => {
      if (a === "paper-build") return -1
      if (b === "paper-build") return 1
      return a.localeCompare(b)
    })
  }, [rows])

  const diffTags = useMemo(() => {
    const s = new Set<string>([...BUILT_IN_VERSION_TAGS, ...Object.keys(tagTipByTag)])
    return Array.from(s).sort((a, b) => {
      if (a === "paper-build") return -1
      if (b === "paper-build") return 1
      return a.localeCompare(b)
    })
  }, [tagTipByTag])

  const groups = useMemo(() => {
    type Group = { kind: "named"; row: DeckVersionRow } | { kind: "unnamed"; rows: DeckVersionRow[] }
    const out: Group[] = []
    let bucket: DeckVersionRow[] = []
    for (const r of rows) {
      if (r.name) {
        if (bucket.length) {
          out.push({ kind: "unnamed", rows: bucket })
          bucket = []
        }
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
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
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

  const handleSelectBranch = async (branchId: string) => {
    if (branchId === currentBranchId) return
    const gen = ++branchSwitchGenRef.current
    const ok = await switchBranch(deckId, branchId)
    if (gen !== branchSwitchGenRef.current) return
    if (!ok) {
      toast.error("Failed to switch branch")
      return
    }
    toast.success("Switched branch")
    onBranchSwitched?.()
    void refresh()
  }

  const handleCreateBranch = async (name: string) => {
    const row = await createBranch(deckId, name)
    if (!row) {
      toast.error("Could not create branch (duplicate name?)")
      return
    }
    toast.success(`Created branch "${row.name}"`)
    void refresh()
  }

  const startRenameBranch = () => {
    if (!currentBranch) return
    setRenameDraft(currentBranch.name)
    setRenamingBranch(true)
  }

  const commitRenameBranch = async () => {
    if (!currentBranch) return
    const next = renameDraft.trim()
    if (!next || next === currentBranch.name) {
      setRenamingBranch(false)
      return
    }
    const ok = await renameBranch(currentBranch.id, next)
    if (!ok) toast.error("Rename failed (name may already exist)")
    else toast.success("Branch renamed")
    setRenamingBranch(false)
    void refresh()
  }

  const openDeleteBranchDialog = () => {
    setBranchIdToDelete(deletableBranches[0]?.id ?? null)
    setDeleteOpen(true)
  }

  const performDeleteBranch = async () => {
    if (!branchIdToDelete) return
    setDeleting(true)
    const err = await deleteBranch(deckId, branchIdToDelete)
    setDeleting(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success("Branch deleted")
    setDeleteOpen(false)
    void refresh()
  }

  const mergeableOthers = useMemo(
    () => branches.filter((b) => b.id !== currentBranchId),
    [branches, currentBranchId]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Versions</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4 shrink-0" />
            {renamingBranch && currentBranch ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  className="h-8 w-44 bg-background/50 border-border"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRenameBranch()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRenameBranch()
                    if (e.key === "Escape") setRenamingBranch(false)
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                title="Double-click to rename"
                disabled={!isOwner || !currentBranch}
                onDoubleClick={() => {
                  if (isOwner) startRenameBranch()
                }}
              >
                {currentBranch?.name ?? "…"}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={branches.length === 0}
                  className="min-w-[9.5rem] justify-between gap-2"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{currentBranch?.name ?? "Branch"}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 bg-popover border-border text-foreground">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Branches</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={
                  currentBranchId && branches.some((b) => b.id === currentBranchId) ? currentBranchId : ""
                }
                onValueChange={(v) => {
                  if (v) void handleSelectBranch(v)
                }}
              >
                {branches.map((b) => (
                  <DropdownMenuRadioItem
                    key={b.id}
                    value={b.id}
                    disabled={!isOwner}
                    className="cursor-pointer"
                  >
                    {b.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => setNewBranchOpen(true)}>
              <GitBranch className="w-3.5 h-3.5 mr-1.5" /> New branch
            </Button>
          )}
          {isOwner && deletableBranches.length > 0 && (
            <Button size="sm" variant="outline" onClick={openDeleteBranchDialog}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete branch
            </Button>
          )}
          {isOwner && mergeableOthers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" disabled={!currentBranch?.head_version_id}>
                    <GitMerge className="w-3.5 h-3.5 mr-1.5" /> Merge into {currentBranch?.name ?? "…"}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56 bg-popover border-border text-foreground">
                {mergeableOthers.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    disabled={!b.head_version_id}
                    onClick={() => {
                      setMergeSource(b)
                      setMergeOpen(true)
                    }}
                  >
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" type="button">
                  <GitCompare className="w-3.5 h-3.5 mr-1.5" /> View diff with…
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 bg-popover border-border text-foreground">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Tagged snapshots (deck-wide)</DropdownMenuLabel>
              {diffTags.map((tag) => {
                const vid = tagTipByTag[tag]
                return (
                  <DropdownMenuItem
                    key={tag}
                    disabled={!vid}
                    onClick={() => {
                      if (vid) onDiffWithVersion(vid, `Latest ${tagLabel(tag)}`)
                    }}
                  >
                    Latest {tagLabel(tag)}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bookmarked.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Bookmarked</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {bookmarked.map((r) => (
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Timeline</h3>
          {isOwner && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add named version
            </Button>
          )}
        </div>
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            No versions on this branch yet. Edits will appear here automatically.
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
      <NewBranchDialog open={newBranchOpen} onOpenChange={setNewBranchOpen} onSubmit={handleCreateBranch} />
      <BranchMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        deckId={deckId}
        branches={branches}
        currentBranchId={currentBranchId ?? ""}
        sourceBranch={mergeSource}
        onMerged={() => {
          onBranchSwitched?.()
          void refresh()
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open && !deleting) setDeleteOpen(false) }}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete branch</DialogTitle>
            <DialogDescription>
              This removes the branch and all version snapshots recorded on it. You cannot delete{" "}
              <span className="font-medium text-foreground">main</span> or the branch you are currently on—switch first
              if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-branch-pick">Branch</Label>
            <Select
              value={branchIdToDelete ?? undefined}
              onValueChange={(v) => {
                if (v) setBranchIdToDelete(v)
              }}
            >
              <SelectTrigger id="delete-branch-pick" className="w-full bg-background/50 border-border">
                <SelectValue placeholder="Choose branch">
                  {(value: string | null) =>
                    deletableBranches.find((b) => b.id === value)?.name ?? "Choose branch"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {deletableBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={performDeleteBranch} disabled={deleting || !branchIdToDelete}>
              {deleting ? "Deleting…" : "Delete branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitCustomTag()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTagTarget(null); setCustomTag("") }} disabled={savingTag}>
              Cancel
            </Button>
            <Button onClick={submitCustomTag} disabled={savingTag || !customTag.trim()}>
              {savingTag ? "Saving..." : "Save tag"}
            </Button>
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
            <Button variant="ghost" onClick={() => setRevertTargetId(null)} disabled={reverting}>
              Cancel
            </Button>
            <Button onClick={performRevert} disabled={reverting}>
              {reverting ? "Reverting..." : "Revert deck"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
