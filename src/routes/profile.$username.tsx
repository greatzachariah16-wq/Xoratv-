import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserX, Sparkles } from "lucide-react";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useFollows } from "@/hooks/useEngagement";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
import { HilltopBannerAd } from "@/components/ads/HilltopBannerAd";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { EmptyState } from "@/components/xora/EmptyState";
import { FeedSkeleton } from "@/components/xora/Skeletons";
import { EngagementAnalyticsCard } from "@/components/rewards/EngagementAnalyticsCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Xora` },
      {
        name: "description",
        content: `Videos, lessons and posts from @${params.username} on Xora.`,
      },
      { property: "og:title", content: `@${params.username} — Xora` },
      { property: "og:description", content: `Follow @${params.username} on Xora.` },
      { property: "og:type", content: "profile" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { user, signOut } = useAuth();
  const follows = useFollows();
  const { data: profile, isPending } = useQuery(profileQuery(username));
  const { data: posts, isPending: postsPending } = useQuery(profilePostsQuery(profile?.id));

  if (!isPending && !profile) {
    return (
      <AppShell>
        <EmptyState
          icon={UserX}
          title="Profile not found"
          description={`No one on Xora goes by @${username}.`}
          action={
            <Link
              to="/"
              className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Back to feed
            </Link>
          }
        />
      </AppShell>
    );
  }

  const isMe = Boolean(user && profile && user.id === profile.id);

  return (
    <AppShell>
      <header className="rise rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-start gap-4">
          <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-semibold tracking-tight">
              {profile?.display_name || username}
            </h1>
            <p className="text-sm text-muted-foreground">@{username}</p>
            {profile?.bio ? (
              <p className="mt-2 text-sm leading-relaxed text-pretty">{profile.bio}</p>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Posts</dt>
            <dd className="font-semibold tabular-nums">{compactNumber(posts?.length ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Followers</dt>
            <dd className="font-semibold tabular-nums">
              {compactNumber(profile?.follower_count ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Following</dt>
            <dd className="font-semibold tabular-nums">
              {compactNumber(profile?.following_count ?? 0)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex gap-2">
          {isMe ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="press rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
            >
              Sign out
            </button>
          ) : profile ? (
            <button
              type="button"
              onClick={() => follows.toggle(profile.id)}
              disabled={follows.pending}
              className={cn(
                "press rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60",
                follows.isFollowing(profile.id)
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {follows.isFollowing(profile.id) ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </header>

      {isMe && user && (
        <div className="mt-6">
          <EngagementAnalyticsCard userId={user.id} />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {postsPending || isPending ? (
          <FeedSkeleton count={2} />
        ) : posts?.length ? (
          posts.map((post) => (
            <div key={post.id}>
              <PostCard post={post} />
              <HilltopBannerAd slotId={post.id} className="my-2.5" />
            </div>
          ))
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No posts yet"
            description={isMe ? "Share your first video or thought." : "Nothing published so far."}
          />
        )}
      </div>
    </AppShell>
  );
}
