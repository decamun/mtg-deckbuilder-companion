export default function BrewLoading() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-6 px-4">
      {/* Search / commander input skeleton */}
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted/50" />
      <div className="h-5 w-96 animate-pulse rounded-md bg-muted/40" />
      <div className="h-12 w-full max-w-md animate-pulse rounded-lg bg-muted/50" />
      {/* Card result skeletons */}
      <div className="mt-4 grid w-full max-w-2xl grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
