export default function BlogLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      {/* Heading skeleton */}
      <div className="mb-2 h-10 w-24 animate-pulse rounded-md bg-muted/50" />
      <div className="mb-10 h-5 w-72 animate-pulse rounded-md bg-muted/40" />
      {/* Article card skeletons */}
      <div className="flex flex-col gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border p-6">
            <div className="mb-2 h-3 w-28 animate-pulse rounded bg-muted/40" />
            <div className="mb-2 h-6 w-3/4 animate-pulse rounded-md bg-muted/50" />
            <div className="mb-1 h-4 w-full animate-pulse rounded bg-muted/40" />
            <div className="mb-4 h-4 w-5/6 animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  )
}
