import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { feedQuery, type FeedType } from "@/lib/api";
import { PostCard } from "./PostCard";
import { HilltopAdsVideoSlider } from "./HilltopAdsVideoSlider";
import { FeedSkeleton } from "./Skeletons";
import { EmptyState, ErrorState } from "./EmptyState";

export function FeedList({ feed, vertical = false }: { feed: FeedType; vertical?: boolean }) {
  const { data, isPending, isError, error, refetch } = useQuery(feedQuery(feed));

  if (isPending) return <FeedSkeleton vertical={vertical} />;
  if (isError)
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  if (!data.length)
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing here yet"
        description="Be the first to post in this feed — upload a video or share a thought."
        action={
          <Link
            to="/create"
            className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Create a post
          </Link>
        }
      />
    );

  return (
    <div className="space-y-4">
      {data.map((post) => (
        <div key={post.id} className="space-y-4">
          <PostCard post={post} vertical={vertical} />
          {vertical ? <HilltopAdsVideoSlider /> : null}
        </div>
      ))}
    </div>
  );
}
