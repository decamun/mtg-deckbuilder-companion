"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BLOG_POSTS } from "@/lib/blog"

const PREVIEW_ROWS = 3
const BLOG_SCROLL_PAGE = 5

export function BlogSection() {
  const [listMode, setListMode] = useState<"preview" | "full">("preview")
  const [visibleCount, setVisibleCount] = useState(BLOG_SCROLL_PAGE)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

  const stopShowingAll = useCallback(() => {
    setListMode("preview")
    setVisibleCount(BLOG_SCROLL_PAGE)
    requestAnimationFrame(() => {
      const el = document.getElementById("blog")
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 56
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
    })
  }, [])

  const expandToFull = useCallback(() => {
    setListMode("full")
    setVisibleCount(BLOG_SCROLL_PAGE)
  }, [])

  const loadMorePosts = useCallback(() => {
    setVisibleCount((n) => Math.min(n + BLOG_SCROLL_PAGE, BLOG_POSTS.length))
  }, [])

  const hasMoreInFull = listMode === "full" && visibleCount < BLOG_POSTS.length

  useEffect(() => {
    if (listMode !== "full" || !hasMoreInFull) return
    const node = loadMoreSentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMorePosts()
      },
      { rootMargin: "240px 0px", threshold: 0 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [listMode, hasMoreInFull, loadMorePosts, visibleCount])

  const previewPosts = BLOG_POSTS.slice(0, PREVIEW_ROWS)
  const postsToRender = listMode === "preview" ? previewPosts : BLOG_POSTS.slice(0, visibleCount)
  const showExpandPreview =
    listMode === "preview" && BLOG_POSTS.length > PREVIEW_ROWS

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h2 className="font-heading mb-2 text-4xl font-bold text-foreground">Blog</h2>
      <p className="mb-10 text-muted-foreground">
        Tips, guides, and strategy for Commander deckbuilding.
      </p>

      {listMode === "full" && (
        <div className="sticky top-14 z-40 -mx-4 mb-8 border-b border-border/70 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-background/75">
          <Button type="button" variant="outline" size="sm" onClick={stopShowingAll}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Stop showing all
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {postsToRender.map((post) => (
          <article
            key={post.slug}
            className="rounded-2xl border border-border p-6 transition-colors hover:border-primary/40"
          >
            <time className="text-xs text-muted-foreground" dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <h3 className="mt-1 mb-2 font-heading text-xl font-bold text-foreground">
              <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-primary">
                {post.title}
              </Link>
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
            <Link
              href={`/blog/${post.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
            >
              Read more <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </article>
        ))}
      </div>

      {showExpandPreview && (
        <div className="mt-10 flex justify-center">
          <Button type="button" size="lg" onClick={expandToFull}>
            Show all posts
          </Button>
        </div>
      )}

      {listMode === "full" && hasMoreInFull && (
        <div
          ref={loadMoreSentinelRef}
          className="mt-10 flex min-h-12 items-center justify-center text-sm text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  )
}
