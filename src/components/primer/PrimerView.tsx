"use client"

import React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import { isAllowedPrimerUrl } from "@/lib/primer-sanitize"
import { CardEmbed } from "./CardEmbed"

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ["target"], ["rel"]],
  },
  // Strip raw HTML; only let the renderer's component overrides do the rendering.
  tagNames: (defaultSchema.tagNames ?? []).filter(t => t !== "img"),
}

const CARD_TOKEN_RE = /\{\{card:([a-f0-9-]{8,})\}\}/g

function renderTextWithCards(text: string): React.ReactNode {
  if (!text.includes("{{card:")) return text
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  CARD_TOKEN_RE.lastIndex = 0
  while ((m = CARD_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    parts.push(<CardEmbed key={`${m.index}-${m[1]}`} printingScryfallId={m[1]} />)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return <>{parts}</>
}

function transformChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === "string") return renderTextWithCards(child)
    return child
  })
}

const components: Components = {
  a({ href, children }) {
    const safe = href && isAllowedPrimerUrl(href)
    if (!safe) {
      return <span className="text-muted-foreground line-through" title="Link removed (host not allowed)">{children}</span>
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {children}
      </a>
    )
  },
  p({ children }) { return <p>{transformChildren(children)}</p> },
  li({ children }) { return <li>{transformChildren(children)}</li> },
  strong({ children }) { return <strong>{transformChildren(children)}</strong> },
  em({ children }) { return <em>{transformChildren(children)}</em> },
  h1({ children }) { return <h1>{transformChildren(children)}</h1> },
  h2({ children }) { return <h2>{transformChildren(children)}</h2> },
  h3({ children }) { return <h3>{transformChildren(children)}</h3> },
}

export function PrimerView({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <div className="text-muted-foreground italic">This deck doesn&apos;t have a primer yet.</div>
  }
  return (
    <div className="prose prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-li:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
