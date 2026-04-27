import { BLOG_POSTS } from "@/lib/blog"

export const metadata = {
  title: "Blog — idlebrew",
  description: "Tips, guides, and strategy for Commander deckbuilding.",
}

export default function BlogPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="font-heading text-4xl font-bold text-foreground mb-2">Blog</h1>
      <p className="text-muted-foreground mb-10">
        Tips, guides, and strategy for Commander deckbuilding.
      </p>

      <div className="flex flex-col gap-12">
        {BLOG_POSTS.map((post) => (
          <article key={post.slug} className="border-t border-border pt-10 first:border-none first:pt-0">
            <time className="text-xs text-muted-foreground" dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <h2 className="font-heading text-2xl font-bold text-foreground mt-1 mb-3">
              {post.title}
            </h2>
            <p className="text-muted-foreground mb-5 italic">{post.excerpt}</p>
            <div className="flex flex-col gap-4">
              {post.body.map((paragraph, i) => (
                <p key={i} className="text-foreground/90 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
