import { notFound } from "next/navigation"
import Link from "next/link"
import { BLOG_POSTS } from "@/lib/blog"
import { BlogPostMarkdown } from "@/components/blog/BlogPostMarkdown"
import { ArrowLeft } from "lucide-react"

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) return {}
  return {
    title: `${post.title} — idlebrew`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = BLOG_POSTS.find((p) => p.slug === slug)

  if (!post) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Blog
      </Link>

      <article>
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
        <h1 className="mt-1 mb-4 font-heading text-4xl font-bold text-foreground">
          {post.title}
        </h1>
        <p className="mb-8 text-lg italic text-muted-foreground">
          {post.excerpt}
        </p>
        {post.markdown ? (
          <BlogPostMarkdown markdown={post.markdown} />
        ) : (
          <div className="flex flex-col gap-5">
            {post.body.map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </article>
    </main>
  )
}
