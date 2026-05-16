export default function ProfileLoading() {
  return (
    <main className="container mx-auto max-w-3xl flex-1 px-4 py-10 space-y-6">
      {/* Profile card skeleton */}
      <div className="rounded-xl border border-border bg-card/50 p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
          {/* Avatar skeleton */}
          <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-muted/50" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-6 w-48 animate-pulse rounded-md bg-muted/50" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      </div>
      {/* Settings card skeletons */}
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card/50 p-6 space-y-4">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted/50" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted/40" />
          <div className="h-10 w-full animate-pulse rounded-md bg-muted/40" />
        </div>
      ))}
    </main>
  )
}
