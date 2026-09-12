import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { feedQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { UserAvatar } from "./UserAvatar";
import { RowSkeleton } from "./Skeletons";

export function TrendingRail() {
  const { data, isPending } = useQuery(feedQuery("home"));

  const trending = [...(data ?? [])].sort((a, b) => b.like_count - a.like_count).slice(0, 5);

  const creators = Array.from(
    new Map(
      (data ?? [])
        .map((post) => post.author)
        .filter((author): author is NonNullable<typeof author> => Boolean(author))
        .map((author) => [author.id, author]),
    ).values(),
  ).slice(0, 4);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Trending now
        </h2>
        <div className="mt-3 space-y-1">
          {isPending ? (
            <RowSkeleton />
          ) : trending.length ? (
            trending.map((post, index) => (
              <Link
                key={post.id}
                to="/video/$postId"
                params={{ postId: post.id }}
                className="press flex gap-3 rounded-xl px-2 py-2 hover:bg-secondary"
              >
                <span className="font-display text-sm font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {post.title || post.caption}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {compactNumber(post.like_count)} likes
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <p className="px-2 text-sm text-muted-foreground">Nothing trending yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Creators to follow
        </h2>
        <div className="mt-3 space-y-1">
          {creators.map((author) => (
            <Link
              key={author.id}
              to="/profile/$username"
              params={{ username: author.username }}
              className="press flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary"
            >
              <UserAvatar path={author.avatar_url} name={author.display_name} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {author.display_name || author.username}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{author.username}
                </span>
              </span>
            </Link>
          ))}
          {!creators.length && !isPending ? (
            <p className="px-2 text-sm text-muted-foreground">No creators yet.</p>
          ) : null}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Xora · Short video for people who teach.
      </p>
    </div>
  );
}
