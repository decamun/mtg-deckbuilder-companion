export default function BrowseLoading() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      {/* Filter bar skeleton */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted/50" />
        <div className="h-10 w-36 animate-pulse rounded-md bg-muted/50" />
        <div className="h-10 w-36 animate-pulse rounded-md bg-muted/50" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-muted/50" />
      </div>
      {/* Deck grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-muted/40 border border-border/50" />
        ))}
      </div>
    </div>
  )
}
