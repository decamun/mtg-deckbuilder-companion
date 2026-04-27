"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Brain } from "lucide-react"

interface Props {
  text: string
}

export function ReasoningPane({ text }: Props) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <div className="my-1 rounded-md border border-border bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3" />
        <span className="font-medium">Thinking</span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t border-border bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  )
}
