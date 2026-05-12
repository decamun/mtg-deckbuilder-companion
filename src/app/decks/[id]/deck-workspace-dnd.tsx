"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import type { CSSProperties, ReactNode } from "react"

export function DraggableDeckCard({
  id,
  disabled,
  className,
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
  title,
  children,
}: {
  id: string
  disabled: boolean
  className?: string
  style?: CSSProperties
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement>) => void
  title?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled })
  const dragStyle: CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : style?.opacity,
    zIndex: isDragging ? 1000 : style?.zIndex,
  }

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={dragStyle}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      {children}
    </div>
  )
}

export function DroppableTagGroup({
  id,
  enabled,
  children,
}: {
  id: string
  enabled: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled })

  return (
    <div
      ref={setNodeRef}
      className={isOver && enabled ? "rounded-lg ring-2 ring-primary/40 ring-offset-4 ring-offset-background" : undefined}
    >
      {children}
    </div>
  )
}
