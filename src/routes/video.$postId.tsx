import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { postQuery } from "@/lib/api";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
import { Comments } from "@/components/xora/Comments";
import { EmptyState } from "@/components/xora/EmptyState";
import { PostCardSkeleton } from "@/components/xora/Skeletons";

export const Route = createFileRoute("/video/$postId")({
  head: () => ({
    meta: [
      { title: "Watch on Xora" },
      { name: "description", content: "Watch this post and join the conversation on Xora." },
      { property: "og:title", content: "Watch on Xora" },
      { property: "og:description", content: "Watch this post and join the conversation." },
    ],
  }),
  component: VideoPage,
});

function VideoPage() {
  const { postId } = Route.useParams();
  const { data, isPending } = useQuery(postQuery(postId));

  return (
    <AppShell>
      {isPending ? (
        <PostCardSkeleton />
      ) : !data ? (
        <EmptyState
          icon={FileQuestion}
          title="Post not found"
          description="This post may have been removed or made private."
          action={
            <Link
              to="/"
              className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Back to feed
            </Link>
          }
        />
      ) : (
        <>
          <PostCard post={data} vertical={data.feed === "shorts"} />
          <Comments postId={data.id} />
        </>
      )}
    </AppShell>
  );
}
