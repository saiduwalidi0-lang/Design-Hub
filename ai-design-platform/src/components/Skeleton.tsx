export function TextSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="h-3 w-full animate-pulse rounded bg-white/10"
          style={{ width: `${Math.max(40, 100 - idx * 6)}%` }}
        />
      ))}
    </div>
  )
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="aspect-[4/3] animate-pulse rounded-lg border border-white/10 bg-white/5"
        />
      ))}
    </div>
  )
}

