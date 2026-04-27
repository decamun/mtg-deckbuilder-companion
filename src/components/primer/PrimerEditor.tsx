"use client"

import { useRef, useState } from "react"
import { Bold, Italic, List as ListIcon, Link as LinkIcon, ImagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { isAllowedPrimerUrl, allowedHostsForDisplay } from "@/lib/primer-sanitize"
import { CardPickerDialog } from "./CardPickerDialog"
import { toast } from "sonner"

interface Props {
  initial: string
  onSave: (markdown: string) => Promise<void>
  onCancel: () => void
}

export function PrimerEditor({ initial, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [cardPickerOpen, setCardPickerOpen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const surroundSelection = (before: string, after: string = before) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || "text"
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    setValue(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const prefixLines = (prefix: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = value.slice(0, start)
    const sel = value.slice(start, end) || "item"
    const after = value.slice(end)
    const lineStart = before.lastIndexOf("\n") + 1
    const block = value.slice(lineStart, end) || sel
    const replaced = block.split("\n").map(l => (l.startsWith(prefix) ? l : prefix + l)).join("\n")
    const next = value.slice(0, lineStart) + replaced + after
    setValue(next)
    requestAnimationFrame(() => ta.focus())
  }

  const insertAtCursor = (text: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = value.slice(0, start) + text + value.slice(end)
    setValue(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const submitLink = () => {
    if (!isAllowedPrimerUrl(linkUrl)) {
      toast.error(`Links are only allowed to: ${allowedHostsForDisplay()}`)
      return
    }
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end) || "link"
    insertAtCursor(`[${sel}](${linkUrl})`)
    setLinkOpen(false)
    setLinkUrl("")
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(value)
    setSaving(false)
  }

  const btn = "h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border border-border rounded-md p-1 bg-card/50 w-fit">
        <button type="button" className={btn} onClick={() => surroundSelection("**")} title="Bold"><Bold className="w-4 h-4" /></button>
        <button type="button" className={btn} onClick={() => surroundSelection("*")} title="Italic"><Italic className="w-4 h-4" /></button>
        <button type="button" className={btn} onClick={() => prefixLines("- ")} title="Bullet list"><ListIcon className="w-4 h-4" /></button>
        <button type="button" className={btn} onClick={() => setLinkOpen(true)} title="Insert link"><LinkIcon className="w-4 h-4" /></button>
        <button type="button" className={btn} onClick={() => setCardPickerOpen(true)} title="Embed a card"><ImagePlus className="w-4 h-4" /></button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full min-h-[400px] font-mono text-sm bg-background/40 border border-border rounded-md p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
        spellCheck
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Primer"}</Button>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="bg-card border border-border text-foreground sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://idlebrew.app/..."
              className="bg-background/50 border-border"
              onKeyDown={e => { if (e.key === "Enter") submitLink() }}
            />
            <p className="text-xs text-muted-foreground">
              Links are restricted to: {allowedHostsForDisplay()}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={submitLink}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardPickerDialog
        open={cardPickerOpen}
        onOpenChange={setCardPickerOpen}
        onPicked={pid => insertAtCursor(`{{card:${pid}}}`)}
      />
    </div>
  )
}
