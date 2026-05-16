export default function DecksLoading() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      {/* Header skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted/50" />
        <div className="h-9 w-28 animate-pulse rounded-md bg-muted/50" />
      </div>
      {/* Deck grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-muted/40 border border-border/50" />
        ))}
      </div>
    </div>
  )
}
