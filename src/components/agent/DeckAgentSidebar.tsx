"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { toast } from "sonner"
import { Send, Square, Trash2, Sparkles, Brain, PanelRightClose, PanelRightOpen, Bell, Network } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ToolChip } from "./ToolChip"
import { ReasoningPane } from "./ReasoningPane"
import { ModelPicker } from "./ModelPicker"
import { AgentMessageText } from "./AgentMessageText"
import {
  DEFAULT_MODEL,
  type ModelId,
} from "@/lib/agent-quota"
import { MODEL_DESCRIPTORS } from "@/lib/agent-models"

interface Props {
  deckId: string
  open: boolean
  onClose: () => void
  onOpen: () => void
}

interface LimitsResponse {
  tier: string
  idlebrewProSubscribed: boolean
  idlebrewProNotifyMe: boolean
  callsPerHour: number
  callsThisHour: number
  callsRemaining: number
  allowedModels: ModelId[]
  resetAt: string
}

function summariseInput(toolName: string, input: unknown): string | undefined {
  if (typeof input !== "object" || !input) return undefined
  const o = input as Record<string, unknown>
  if (toolName === "search_scryfall" && typeof o.query === "string") return o.query
  if (toolName === "add_card" && typeof o.name === "string") {
    const qty = typeof o.quantity === "number" ? o.quantity : 1
    return `${qty}× ${o.name}`
  }
  if (typeof o.tag === "string") return `"${o.tag}"`
  if (typeof o.deck_card_id === "string") return `card ${o.deck_card_id.slice(0, 8)}…`
  return undefined
}

function summariseOutput(toolName: string, output: unknown): string | undefined {
  if (typeof output !== "object" || !output) return undefined
  const o = output as Record<string, unknown>
  if (toolName === "search_scryfall") {
    const cards = Array.isArray(o.cards) ? o.cards.length : 0
    const total = typeof o.total === "number" ? o.total : cards
    return `${cards} of ${total} returned`
  }
  if (toolName === "add_card") return `quantity now ${String(o.quantity ?? "?")}`
  if (toolName === "get_decklist" && Array.isArray(o)) return `${o.length} entries`
  if (Array.isArray(o.tags)) return `tags: ${o.tags.join(", ") || "(none)"}`
  return undefined
}

const MIN_WIDTH = 240
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 320

export function DeckAgentSidebar({ deckId, open, onClose, onOpen }: Props) {
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL)
  const [reasoning, setReasoning] = useState(false)
  const [draft, setDraft] = useState("")
  const [limits, setLimits] = useState<LimitsResponse | null>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [savingNotify, setSavingNotify] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)

  const handleResizeStart = (e: React.MouseEvent) => {
    // Resize only on md+ screens (≥768px)
    if (window.innerWidth < 768) return
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + startX - ev.clientX)))
    }
    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/agent/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            deckId,
            modelId: model,
            enableReasoning: reasoning,
            ...(body ?? {}),
          },
        }),
      }),
    [deckId, model, reasoning]
  )

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    transport,
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Agent error"
      toast.error(msg)
    },
  })

  useEffect(() => {
    if (!open) return
    fetch("/api/agent/limits", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setLimits(j))
      .catch(() => undefined)
  }, [open, status])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, status])

  const isStreaming = status === "submitted" || status === "streaming"
  const allowedModels = limits?.allowedModels ?? [DEFAULT_MODEL]

  const handleSend = () => {
    const text = draft.trim()
    if (!text || isStreaming) return
    void sendMessage({ text })
    setDraft("")
  }

  const handleClear = () => {
    setMessages([])
  }

  const refreshLimits = async () => {
    try {
      const res = await fetch("/api/agent/limits", { credentials: "include" })
      setLimits(res.ok ? await res.json() : null)
    } catch {
      // Ignore; the sidebar can still render with default free limits.
    }
  }

  const handleNotifyMe = async () => {
    setSavingNotify(true)
    try {
      const res = await fetch("/api/account/idlebrew-pro/notify", {
        method: "POST",
        credentials: "include",
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.message ?? "Failed to save notification preference")
      setLimits((current) =>
        current ? { ...current, idlebrewProNotifyMe: body.idlebrewProNotifyMe } : current
      )
      toast.success("We'll notify you when idlebrew pro is ready.")
      setSubscribeOpen(false)
      void refreshLimits()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save notification preference"
      toast.error(message)
    } finally {
      setSavingNotify(false)
    }
  }

  if (!open) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l border-border bg-card/50 py-3 gap-4">
        <button
          onClick={onOpen}
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Open Deck assistant"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span
          className="text-[10px] font-medium text-muted-foreground select-none"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Deck assistant
        </span>
      </aside>
    )
  }

  const isMcpMode = model === 'use-mcp'
  const modelDesc = MODEL_DESCRIPTORS[model]
  const reasoningAvailable = modelDesc.reasoning
  const proSubscribed = Boolean(limits?.idlebrewProSubscribed)

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-border bg-card/95 shadow-xl"
      style={{ width }}
    >
      {/* Drag handle — desktop only */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 w-1 hidden md:block cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={handleResizeStart}
      />

      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Deck assistant</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} title="Collapse sidebar">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-border bg-background/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <ModelPicker
            value={model}
            onChange={setModel}
            allowedModels={allowedModels}
            onLockedModelClick={() => setSubscribeOpen(true)}
          />
          {!isMcpMode && (
            <Button
              variant={reasoning ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (!reasoningAvailable) {
                  if (proSubscribed) {
                    toast.info("Choose a smarter model to enable thinking.")
                  } else {
                    setSubscribeOpen(true)
                  }
                  return
                }
                setReasoning((r) => !r)
              }}
              className={`h-8 gap-1 px-2 text-xs ${reasoningAvailable ? "" : "opacity-50"}`}
              title={
                reasoningAvailable
                  ? "Toggle thinking"
                  : proSubscribed
                    ? "Choose a smarter model to enable thinking"
                    : "Subscribe to unlock smarter models"
              }
              aria-disabled={!reasoningAvailable}
            >
              <Brain className="h-3 w-3" /> Think
            </Button>
          )}
        </div>
        {limits && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {limits.callsRemaining}/{limits.callsPerHour} calls remaining this hour
            <span className="mx-1.5">·</span>
            {limits.tier} tier
          </p>
        )}
      </div>

      {isMcpMode ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Network className="h-8 w-8 text-primary/60" />
            <p className="font-semibold text-foreground">Using your MCP connection</p>
            <p className="text-xs text-muted-foreground">
              Connect an MCP-aware client to control this deck from your AI assistant.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="mb-1 text-xs text-muted-foreground">MCP server URL</p>
            <code className="break-all font-mono text-xs text-foreground">
              https://idlebrew.com/api/mcp
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Generate an API key in your{" "}
            <Link href="/profile" className="text-primary underline underline-offset-2">
              profile settings
            </Link>{" "}
            and pass it as{" "}
            <code className="font-mono">Authorization: Bearer YOUR_KEY</code>.
          </p>
          <Link
            href="/blog/connecting-idlebrew-mcp"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Step-by-step setup guide →
          </Link>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4">
            {messages.length === 0 && !error && (
              <div className="text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Ask me to:</p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  <li>Find ramp under 3 mana for my colors</li>
                  <li>Tag every wincon and tutor in this deck</li>
                  <li>Swap all my Sol Ring printings to LEA</li>
                  <li>Add 5 budget green removal spells</li>
                </ul>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error.message}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-border bg-background/30 p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask the agent… (Shift+Enter for newline)"
              className="mb-2 min-h-[68px] resize-none text-sm"
              disabled={isStreaming}
            />
            <div className="flex items-center justify-end gap-2">
              {isStreaming ? (
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" onClick={handleSend} disabled={!draft.trim()}>
                  <Send className="h-3.5 w-3.5" /> Send
                </Button>
              )}
            </div>
          </footer>
        </>
      )}
      <Dialog open={subscribeOpen} onOpenChange={setSubscribeOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>idlebrew pro</DialogTitle>
            <DialogDescription>
              Feature coming soon.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Subscribe for no ads, higher brewing-agent usage limits, and smarter brewing-agent models.
            </p>
            {limits?.idlebrewProNotifyMe && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                You are already on the notification list.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleNotifyMe}
              disabled={savingNotify || Boolean(limits?.idlebrewProNotifyMe)}
            >
              <Bell className="h-4 w-4" />
              {limits?.idlebrewProNotifyMe
                ? "Notifications on"
                : savingNotify
                  ? "Saving..."
                  : "Notify me"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={`text-sm ${isUser ? "text-right" : ""}`}>
      <div
        className={`inline-block max-w-full rounded-lg px-3 py-2 text-left ${
          isUser
            ? "bg-primary/15 text-foreground whitespace-pre-wrap"
            : "bg-muted/40 text-foreground"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (isUser) return <span key={i}>{part.text}</span>
            return <AgentMessageText key={i} text={part.text} />
          }
          if (part.type === "reasoning") {
            return <ReasoningPane key={i} text={part.text} />
          }
          if (part.type.startsWith("tool-")) {
            const toolPart = part as unknown as {
              type: string
              state: "input-streaming" | "input-available" | "output-available" | "output-error"
              input?: unknown
              output?: unknown
              errorText?: string
            }
            const toolName = toolPart.type.replace(/^tool-/, "")
            return (
              <ToolChip
                key={i}
                toolName={toolName}
                state={toolPart.state}
                inputSummary={summariseInput(toolName, toolPart.input)}
                outputSummary={summariseOutput(toolName, toolPart.output)}
                errorText={toolPart.errorText}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
