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

const CARD_TOKEN_RE = /\{\{card:([a-f0-9-]{8,})\}\}/gi

/** True when the paragraph (or list item) is only card tokens and whitespace — renders as block images. */
function isCardsOnlyPlainText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^(\{\{card:[a-f0-9-]{8,}\}\}[\s]*)+$/i.test(t)
}

function extractCardIdsFromPlainText(text: string): string[] {
  const ids: string[] = []
  let m: RegExpExecArray | null
  CARD_TOKEN_RE.lastIndex = 0
  while ((m = CARD_TOKEN_RE.exec(text)) !== null) {
    ids.push(m[1])
  }
  return ids
}

function flattenStringChildren(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(flattenStringChildren).join("")
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    return flattenStringChildren(props?.children ?? "")
  }
  return ""
}

/** Card-only block detection must not treat formatted wrappers (e.g. italic around a token) as a solo line. */
function isPlainTextOnlyChildren(children: React.ReactNode): boolean {
  let ok = true
  React.Children.forEach(children, child => {
    if (!ok) return
    if (child == null || typeof child === "boolean") return
    if (typeof child === "string" || typeof child === "number") return
    if (React.isValidElement(child)) {
      if (child.type === React.Fragment) {
        const props = child.props as { children?: React.ReactNode }
        if (!isPlainTextOnlyChildren(props?.children)) ok = false
      } else {
        ok = false
      }
    }
  })
  return ok
}

function renderTextWithCards(text: string): React.ReactNode {
  if (!text.includes("{{card:")) return text
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  CARD_TOKEN_RE.lastIndex = 0
  while ((m = CARD_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    parts.push(<CardEmbed key={`${m.index}-${m[1]}`} printingScryfallId={m[1]} variant="inline" />)
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

function renderSoloCardBlocks(flatText: string): React.ReactNode {
  const ids = extractCardIdsFromPlainText(flatText)
  return (
    <div className="not-prose my-6 space-y-5 first:mt-0 last:mb-0">
      {ids.map((id, i) => (
        <CardEmbed key={`${id}-${i}`} printingScryfallId={id} variant="block" />
      ))}
    </div>
  )
}

const headingBase = "font-heading text-foreground scroll-mt-20 text-balance first:mt-0"

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
  p({ children }) {
    if (isPlainTextOnlyChildren(children)) {
      const flat = flattenStringChildren(children)
      if (isCardsOnlyPlainText(flat)) {
        return renderSoloCardBlocks(flat)
      }
    }
    return <p className="my-4 leading-relaxed first:mt-0 last:mb-0">{transformChildren(children)}</p>
  },
  li({ children }) {
    if (isPlainTextOnlyChildren(children)) {
      const flat = flattenStringChildren(children)
      if (isCardsOnlyPlainText(flat)) {
        return (
          <li className="my-4 list-none pl-0">
            {renderSoloCardBlocks(flat)}
          </li>
        )
      }
    }
    return <li className="my-1">{transformChildren(children)}</li>
  },
  strong({ children }) { return <strong>{transformChildren(children)}</strong> },
  em({ children }) { return <em>{transformChildren(children)}</em> },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-2 border-primary/40 pl-4 text-muted-foreground">
        {transformChildren(children)}
      </blockquote>
    )
  },
  td({ children }) { return <td>{transformChildren(children)}</td> },
  th({ children }) { return <th>{transformChildren(children)}</th> },
  h1({ children }) {
    return (
      <h1 className={`${headingBase} mt-12 mb-4 pt-1 text-3xl font-bold tracking-tight sm:text-4xl`}>
        {transformChildren(children)}
      </h1>
    )
  },
  h2({ children }) {
    return (
      <h2 className={`${headingBase} mt-10 mb-3 pt-1 text-2xl font-bold tracking-tight sm:text-3xl`}>
        {transformChildren(children)}
      </h2>
    )
  },
  h3({ children }) {
    return (
      <h3 className={`${headingBase} mt-9 mb-2.5 text-xl font-bold tracking-tight sm:text-2xl`}>
        {transformChildren(children)}
      </h3>
    )
  },
  h4({ children }) {
    return (
      <h4 className={`${headingBase} mt-8 mb-2 text-lg font-bold tracking-wide sm:text-xl`}>
        {transformChildren(children)}
      </h4>
    )
  },
  h5({ children }) {
    return (
      <h5 className={`mt-7 mb-2 scroll-mt-20 text-base font-semibold tracking-wide text-foreground sm:text-lg`}>
        {transformChildren(children)}
      </h5>
    )
  },
  h6({ children }) {
    return (
      <h6 className={`mt-6 mb-1.5 scroll-mt-20 text-sm font-semibold tracking-wide text-foreground sm:text-base`}>
        {transformChildren(children)}
      </h6>
    )
  },
}

export function PrimerView({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <div className="text-muted-foreground italic">This deck doesn&apos;t have a primer yet.</div>
  }
  return (
    <div className="primer-markdown prose prose-invert max-w-none overflow-visible prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground/90 prose-p:leading-relaxed prose-li:text-foreground/90 prose-table:text-sm prose-th:text-foreground prose-td:text-foreground/90 [&>:first-child:is(h1,h2,h3,h4,h5,h6)]:!mt-3">
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
