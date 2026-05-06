"use client"

import { Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react"

type State = "input-streaming" | "input-available" | "output-available" | "output-error"

interface Props {
  toolName: string
  state: State
  inputSummary?: string
  outputSummary?: string
  errorText?: string
}

const TOOL_LABELS: Record<string, string> = {
  search_scryfall: "Searching Scryfall",
  list_printings: "Listing printings",
  get_deck: "Reading deck",
  get_decklist: "Reading decklist",
  add_card: "Adding card",
  remove_card: "Removing card",
  set_card_quantity: "Setting quantity",
  add_card_tag: "Adding tag",
  remove_card_tag: "Removing tag",
  set_card_tags: "Setting tags",
  set_card_printing: "Changing printing",
  set_card_finish: "Setting finish",
  set_commanders: "Setting commanders",
  set_cover_image: "Setting cover image",
  get_primer: "Reading primer",
  set_primer: "Writing primer",
}

export function ToolChip({ toolName, state, inputSummary, outputSummary, errorText }: Props) {
  const label = TOOL_LABELS[toolName] ?? toolName
  const isPending = state === "input-streaming" || state === "input-available"
  const isError = state === "output-error"

  return (
    <div
      className={`my-1 flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${
        isError
          ? "border-destructive/40 bg-destructive/10"
          : isPending
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-muted/30"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Wrench className="h-3 w-3 text-muted-foreground" />
          {label}
        </div>
        {inputSummary && (
          <div className="truncate text-muted-foreground">{inputSummary}</div>
        )}
        {outputSummary && !isError && (
          <div className="truncate text-muted-foreground">{outputSummary}</div>
        )}
        {errorText && (
          <div className="truncate text-destructive">{errorText}</div>
        )}
      </div>
    </div>
  )
}
