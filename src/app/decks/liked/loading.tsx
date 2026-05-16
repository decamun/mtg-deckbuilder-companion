export default function LikedDecksLoading() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      {/* Page header skeleton */}
      <div className="mb-8">
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted/50" />
        <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted/40" />
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
