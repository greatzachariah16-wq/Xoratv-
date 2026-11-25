export function XoraLoading({
  title = "Loading",
  subtitle = "Getting everything ready for you.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="xora-loading-screen" role="status" aria-live="polite" aria-label={title}>
      <div className="xora-loading-card">
        <div className="xora-loading-mark" aria-hidden="true">
          <span className="xora-loading-mark-letter">X</span>
        </div>
        <div className="xora-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="xora-loading-title">{title}</p>
        <p className="xora-loading-subtitle">{subtitle}</p>
      </div>
      <span className="sr-only">Please wait</span>
    </div>
  );
}

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
  if (vertical) {
    return (
      <div className="mx-auto w-full max-w-[420px]" role="status" aria-label="Loading Shorts">
        <div className="relative aspect-[9/16] max-h-[68dvh] overflow-hidden rounded-[26px] border border-border/70 bg-gradient-to-br from-secondary via-surface to-primary/10 shadow-sm">
          <div className="absolute inset-x-5 top-5 flex items-center gap-3">
            <span className="shimmer size-9 rounded-full" />
            <span className="shimmer h-3 w-28 rounded-full" />
          </div>
          <div className="absolute inset-x-5 bottom-6 space-y-3">
            <span className="shimmer block h-3 w-3/4 rounded-full" />
            <span className="shimmer block h-3 w-1/2 rounded-full" />
          </div>
          <div className="absolute bottom-1/2 left-1/2 size-11 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
        <span className="sr-only">Finding fresh videos from Xora creators.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4" role="status" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, index) => (
        <PostCardSkeleton key={index} />
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
