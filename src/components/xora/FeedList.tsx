import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Users, Compass, Loader2 } from "lucide-react";
import { feedInfiniteQuery, type FeedType } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PostCard } from "./PostCard";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { ExoClickNativeAd } from "@/components/ads/ExoClickNativeAd";
import { FeedSkeleton } from "./Skeletons";
import { EmptyState, ErrorState } from "./EmptyState";
import { DataSaverBadge } from "./DataSaverBadge";
import { cn } from "@/lib/utils";

export function FeedList({ feed, vertical = false }: { feed: FeedType; vertical?: boolean }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"for_you" | "following">("for_you");
  const [activeShortId, setActiveShortId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(feedInfiniteQuery(feed, user?.id, mode));

  const allPosts = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data?.pages]);

  // Bottom sentinel for infinite scrolling in batches of 10
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // For shorts/vertical: identify and set only ONE primary in-view card to autoPlay
  useEffect(() => {
    if (feed !== "shorts" && !vertical) return;
    if (allPosts.length === 0) return;

    if (!activeShortId && allPosts[0]) {
      setActiveShortId(allPosts[0].id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = entry.target.getAttribute("data-post-id");
            if (id) {
              setActiveShortId(id);
            }
          }
        }
      },
      {
        threshold: [0.5, 0.75],
      },
    );

    cardRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [feed, vertical, allPosts, activeShortId]);

  return (
    <div className="space-y-4">
      {feed === "home" ? (
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("for_you")}
              className={cn(
                "press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                mode === "for_you"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              <Compass className="size-3.5" aria-hidden="true" />
              For You
            </button>
            <button
              type="button"
              onClick={() => setMode("following")}
              className={cn(
                "press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                mode === "following"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="size-3.5" aria-hidden="true" />
              Following
            </button>
          </div>

          <DataSaverBadge />
        </div>
      ) : null}

      {isPending ? (
        <FeedSkeleton vertical={vertical} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : !allPosts.length ? (
        <EmptyState
          icon={mode === "following" ? Users : Sparkles}
          title={mode === "following" ? "No posts from followed creators" : "Nothing here yet"}
          description={
            mode === "following"
              ? "Follow creators from the 'For You' feed or search to see their latest videos here."
              : "Be the first to post in this feed — upload a video or share a thought."
          }
          action={
            mode === "following" ? (
              <button
                type="button"
                onClick={() => setMode("for_you")}
                className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Explore For You
              </button>
            ) : (
              <Link
                to="/create"
                className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Create a post
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {allPosts.map((post, index) => {
            const isAutoPlay = feed === "shorts" || vertical ? activeShortId === post.id : false;
            const showInHouseAd = (index + 1) % 5 === 0;
            const showExoClickAd = (index + 1) % 3 === 0;
            return (
              <div key={post.id}>
                <div
                  ref={(el) => {
                    if (el) cardRefs.current.set(post.id, el);
                    else cardRefs.current.delete(post.id);
                  }}
                  data-post-id={post.id}
                >
                  <PostCard post={post} vertical={vertical} autoPlay={isAutoPlay} />
                </div>
                {showExoClickAd && <ExoClickNativeAd className="my-3.5" />}
                {showInHouseAd && (
                  <XoraInHouseAd placement="home_feed" variant="compact" className="my-3.5" />
                )}
              </div>
            );
          })}

          {/* Pagination sentinel */}
          <div ref={sentinelRef} className="py-2 flex justify-center items-center">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Loading more...</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
