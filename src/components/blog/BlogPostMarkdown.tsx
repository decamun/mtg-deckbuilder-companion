"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"

const components: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  pre({ children }) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm">
        {children}
      </pre>
    )
  },
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith("language-")
    if (isBlock) {
      return (
        <code className="font-mono text-sm" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    )
  },
}

export function BlogPostMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-heading prose-headings:text-foreground prose-p:text-foreground/90 prose-p:leading-relaxed prose-strong:text-foreground prose-li:my-0.5 prose-li:text-foreground/90 prose-table:text-sm prose-th:text-foreground prose-td:text-foreground/90 prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
