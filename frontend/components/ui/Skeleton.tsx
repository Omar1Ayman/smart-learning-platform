interface SkeletonProps {
  className?: string;
}

/** Shimmer block for loading placeholders. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-paper-muted ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
    </div>
  );
}

/** Table skeleton — use in list pages while data is loading. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-elevated overflow-hidden">
      <div className="border-b border-line bg-paper-muted p-3">
        <div className="flex gap-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex gap-3 border-b border-line p-3 last:border-0"
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid skeleton — use in card-based list views. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-elevated p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}