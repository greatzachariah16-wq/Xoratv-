import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  UserX,
  Sparkles,
  Share2,
  LogOut,
  Film,
  Award,
  Check,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useFollows } from "@/hooks/useEngagement";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
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
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const follows = useFollows();
  const { data: profile, isPending } = useQuery(profileQuery(username));
  const { data: posts, isPending: postsPending } = useQuery(profilePostsQuery(profile?.id));
  const [activeTab, setActiveTab] = useState<"posts" | "rewards">("posts");
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `@${username} on Xora`,
          text: `Check out @${username}'s profile on Xora`,
          url,
        });
        return;
      } catch {
        // User cancelled or share failed, fallback to copy
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed
    }
  };

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
      <div className="space-y-4">
        {/* Mobile-optimized Profile Header Card */}
        <header className="rise relative overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6">
          {/* Subtle warm accent banner */}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent sm:h-20" />

          <div className="relative pt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="relative inline-block self-start">
                <div className="rounded-full ring-4 ring-surface shadow-md">
                  <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={76} />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="truncate font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {profile?.display_name || username}
                  </h1>
                  <span className="text-xs font-medium text-muted-foreground">@{username}</span>
                </div>

                {profile?.bio ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3 sm:line-clamp-none">
                    {profile.bio}
                  </p>
                ) : null}

                {/* Tactile Mobile Stats Strip */}
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-surface-raised/40 p-2.5 text-center sm:flex sm:gap-6 sm:bg-transparent sm:p-0 sm:text-left sm:border-0">
                  <div className="flex flex-col">
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Posts</dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {compactNumber(posts?.length ?? 0)}
                    </dd>
                  </div>
                  <div className="flex flex-col border-x border-border/40 sm:border-0">
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Followers</dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {compactNumber(profile?.follower_count ?? 0)}
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Following</dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {compactNumber(profile?.following_count ?? 0)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="mt-5 flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
              {isMe ? (
                <>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="press inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        <span>Link copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="size-3.5" />
                        <span>Share Profile</span>
                      </>
                    )}
                  </button>

                  <Link
                    to="/rewards"
                    className="press inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    <Award className="size-3.5" />
                    <span>Rewards Hub</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="press inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                    title="Sign out"
                  >
                    <LogOut className="size-3.5" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </>
              ) : (
                <>
                  {profile ? (
                    <button
                      type="button"
                      onClick={() => follows.toggle(profile.id)}
                      disabled={follows.pending}
                      className={cn(
                        "press inline-flex flex-1 sm:flex-initial items-center justify-center rounded-full px-5 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
                        follows.isFollowing(profile.id)
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {follows.isFollowing(profile.id) ? "Following" : "Follow"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleShare}
                    className="press inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Share2 className="size-3.5" />}
                    <span>{copied ? "Copied" : "Share"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Tab Navigation for Creators viewing their own profile */}
        {isMe && user && (
          <div className="flex rounded-2xl border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setActiveTab("posts")}
              className={cn(
                "press flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all",
                activeTab === "posts"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Film className="size-3.5" />
              <span>Posts</span>
              <span className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px]",
                activeTab === "posts" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}>
                {posts?.length ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rewards")}
              className={cn(
                "press flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all",
                activeTab === "rewards"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Award className="size-3.5" />
              <span>Rewards & Watch Tracker</span>
            </button>
          </div>
        )}

        {/* Content Area */}
        {isMe && user && activeTab === "rewards" ? (
          <div className="space-y-4">
            <EngagementAnalyticsCard
              userId={user.id}
              onClaimClick={() => void navigate({ to: "/rewards" })}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {postsPending || isPending ? (
              <FeedSkeleton count={2} />
            ) : posts?.length ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <EmptyState
                icon={Sparkles}
                title="No posts yet"
                description={isMe ? "Share your first video or thought." : "Nothing published so far."}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
