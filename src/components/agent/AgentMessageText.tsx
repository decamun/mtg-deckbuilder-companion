"use client"

import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { CardNameTooltip } from "./CardNameTooltip"

export function AgentMessageText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Render bold text as card-name tooltips
        strong({ children }) {
          const name = extractText(children)
          if (!name) return <strong>{children}</strong>
          return <CardNameTooltip name={name} />
        },
        // Style headings and block elements to fit the chat bubble
        h1: ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
        h2: ({ children }) => <p className="font-bold text-sm mb-1">{children}</p>,
        h3: ({ children }) => <p className="font-semibold text-sm mb-0.5">{children}</p>,
        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ children }) => (
          <code className="rounded bg-muted/60 px-1 py-0.5 text-xs font-mono">{children}</code>
        ),
        hr: () => <hr className="my-2 border-border" />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function extractText(children: ReactNode): string | null {
  if (typeof children === "string") return children.trim() || null
  if (Array.isArray(children)) {
    const parts = children.map((c) => (typeof c === "string" ? c : "")).join("")
    return parts.trim() || null
  }
  return null
}
