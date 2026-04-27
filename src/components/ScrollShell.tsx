"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { BrewSection } from "@/components/BrewSection"
import { DecksSection } from "@/components/DecksSection"
import { BLOG_POSTS } from "@/lib/blog"

const SECTION_PATHS: Record<string, string> = {
  brew: "/brew",
  decks: "/decks",
  blog: "/blog",
}

interface Props {
  initialSection: "brew" | "decks" | "blog"
}

export function ScrollShell({ initialSection }: Props) {
  const brewRef = useRef<HTMLElement>(null)
  const decksRef = useRef<HTMLElement>(null)
  const blogRef = useRef<HTMLElement>(null)

  // Jump to the requested section immediately after hydration
  useEffect(() => {
    if (initialSection === "brew") return
    const refMap = { decks: decksRef, blog: blogRef }
    refMap[initialSection].current?.scrollIntoView({ behavior: "instant" })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update the URL and fire a nav event as the user scrolls between sections.
  // rootMargin "-50% 0px -50% 0px" creates a 1px detection line at the
  // viewport center so only the section currently occupying that center fires.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const path = SECTION_PATHS[entry.target.id]
            if (path) {
              window.history.replaceState(null, "", path)
              window.dispatchEvent(
                new CustomEvent("sectionchange", { detail: { path } })
              )
            }
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    )

    for (const ref of [brewRef, decksRef, blogRef]) {
      if (ref.current) obs.observe(ref.current)
    }

    return () => obs.disconnect()
  }, [])

  return (
    <div className="flex flex-1 flex-col">
      <section
        id="brew"
        ref={brewRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col border-b border-border"
      >
        <BrewSection />
      </section>

      <section
        id="decks"
        ref={decksRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col border-b border-border"
      >
        <DecksSection />
      </section>

      <section
        id="blog"
        ref={blogRef}
        className="flex min-h-[calc(100vh-3.5rem)] flex-col"
      >
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
          <h2 className="font-heading text-4xl font-bold text-foreground mb-2">
            Blog
          </h2>
          <p className="mb-10 text-muted-foreground">
            Tips, guides, and strategy for Commander deckbuilding.
          </p>

          <div className="flex flex-col gap-6">
            {BLOG_POSTS.map((post) => (
              <article
                key={post.slug}
                className="rounded-2xl border border-border p-6 transition-colors hover:border-primary/40"
              >
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={post.date}
                >
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <h3 className="mt-1 mb-2 font-heading text-xl font-bold text-foreground">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="transition-colors hover:text-primary"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
                >
                  Read more <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
