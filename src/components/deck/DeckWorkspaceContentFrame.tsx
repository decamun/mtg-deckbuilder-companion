import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Deck workspace main column: centered max width, horizontal padding, and `min-w-0` so nested flex
 * rows can shrink instead of forcing overflow at ~390px (see issue #226).
 */
export function DeckWorkspaceContentFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 max-w-7xl space-y-8 px-4 py-6 sm:px-6",
        className
      )}
    >
      {children}
    </div>
  )
}
