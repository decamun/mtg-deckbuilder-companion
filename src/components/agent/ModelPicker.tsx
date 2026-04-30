"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_MODELS, type ModelId } from "@/lib/agent-quota"
import { MODEL_DESCRIPTORS } from "@/lib/agent-models"

interface Props {
  value: ModelId
  onChange: (m: ModelId) => void
  allowedModels: ReadonlyArray<ModelId>
  onLockedModelClick: () => void
}

export function ModelPicker({ value, onChange, allowedModels, onLockedModelClick }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const next = v as ModelId
        if (!allowedModels.includes(next)) {
          onLockedModelClick()
          return
        }
        onChange(next)
      }}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_MODELS.map((id) => {
          const desc = MODEL_DESCRIPTORS[id]
          const allowed = allowedModels.includes(id)
          return (
            <SelectItem
              key={id}
              value={id}
              className={`text-xs ${allowed ? "" : "opacity-50"}`}
            >
              <span className="flex items-center gap-2">
                {desc.label}
                {!allowed && (
                  <span className="rounded bg-primary/15 px-1 py-px font-mono text-[10px] uppercase text-primary">
                    Pro
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
