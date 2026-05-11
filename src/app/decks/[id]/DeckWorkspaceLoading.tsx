import { Loader2 } from "lucide-react"

export function DeckWorkspaceLoading() {
  return (
    <div className="fixed top-14 inset-x-0 bottom-0 flex flex-col overflow-hidden bg-background font-sans text-foreground">
      <header className="relative z-40 flex h-28 shrink-0 items-center border-b border-border bg-secondary/80 px-4">
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted/50" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted/50" />
          <div className="h-9 w-9 animate-pulse rounded-md bg-muted/50" />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading deck editor…</span>
      </div>
    </div>
  )
}
