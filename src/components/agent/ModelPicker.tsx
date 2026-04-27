"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_MODELS, type ModelId } from "@/lib/agent-quota"
import { MODEL_DESCRIPTORS } from "@/lib/agent-models"

interface Props {
  value: ModelId
  onChange: (m: ModelId) => void
  allowedModels: ReadonlyArray<ModelId>
}

export function ModelPicker({ value, onChange, allowedModels }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModelId)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_MODELS.map((id) => {
          const desc = MODEL_DESCRIPTORS[id]
          const allowed = allowedModels.includes(id)
          return (
            <SelectItem key={id} value={id} disabled={!allowed} className="text-xs">
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
