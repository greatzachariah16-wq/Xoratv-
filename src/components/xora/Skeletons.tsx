export function PostCardSkeleton({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="shimmer size-10 rounded-full" />
        <div className="space-y-2">
          <div className="shimmer h-3 w-28 rounded-full" />
          <div className="shimmer h-2.5 w-16 rounded-full" />
        </div>
      </div>
      <div
        className={`shimmer mt-3 w-full rounded-xl ${vertical ? "aspect-[9/16]" : "aspect-video"}`}
      />
      <div className="mt-3 space-y-2">
        <div className="shimmer h-3 w-3/4 rounded-full" />
        <div className="shimmer h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

export function FeedSkeleton({
  count = 3,
  vertical = false,
}: {
  count?: number;
  vertical?: boolean;
}) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, index) => (
        <PostCardSkeleton key={index} vertical={vertical} />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
      aria-hidden="true"
    >
      <div className="shimmer size-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-3 w-40 rounded-full" />
        <div className="shimmer h-2.5 w-24 rounded-full" />
      </div>
    </div>
  );
}
