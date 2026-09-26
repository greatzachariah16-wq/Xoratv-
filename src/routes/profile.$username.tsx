import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserX, Sparkles } from "lucide-react";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useFollows } from "@/hooks/useEngagement";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { EmptyState } from "@/components/xora/EmptyState";
import { FeedSkeleton } from "@/components/xora/Skeletons";
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
    <AppShell wide>
      <div className="space-y-5">
        <header className="relative overflow-hidden rounded-[30px] border border-border bg-surface shadow-card">
          <div className="h-28 bg-gradient-to-br from-primary/20 via-background to-secondary/70" />
          <div className="relative px-5 pb-5 sm:px-7">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
              <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={82} />
              {isMe ? (
                <button type="button" onClick={() => void signOut()} className="press rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary">Sign out</button>
              ) : profile ? (
                <button type="button" onClick={() => follows.toggle(profile.id)} disabled={follows.pending} className={cn("press rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-60", follows.isFollowing(profile.id) ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground")}>{follows.isFollowing(profile.id) ? "Following" : "Follow"}</button>
              ) : null}
            </div>
            <div className="mt-4">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{profile?.display_name || username}</h1>
              <p className="mt-1 text-sm text-muted-foreground">@{username}</p>
              {profile?.bio ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">{profile.bio}</p> : null}
            </div>
            <dl className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-background/70">
              {[["Posts", posts?.length ?? 0],["Followers", profile?.follower_count ?? 0],["Following", profile?.following_count ?? 0]].map(([label,value])=><div key={String(label)} className="px-3 py-4 text-center"><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 font-display text-lg font-semibold tabular-nums">{compactNumber(Number(value))}</dd></div>)}
            </dl>
          </div>
        </header>

      <div className="mt-6 space-y-4">
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
      </div>
    </AppShell>
  );
}
