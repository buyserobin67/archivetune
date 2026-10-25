/** Quiet placeholders shown for the instant before the library has loaded, so screens never flash empty. */
export function ShelfSkeleton() {
  return (
    <div className="px-gutter" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-3 h-6 w-32" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[9.5rem] shrink-0">
            <div className="skeleton aspect-square w-full rounded-lg" />
            <div className="skeleton mt-2 h-3.5 w-3/4" />
            <div className="skeleton mt-1.5 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-gutter" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-12 w-12 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-3.5 w-3/5" />
            <div className="skeleton mt-2 h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
