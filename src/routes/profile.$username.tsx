import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, PenLine, LogOut } from "lucide-react";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptions } from "@/hooks/useEngagement";
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
      { name: "description", content: `Videos, lessons and posts from @${params.username} on Xora.` },
      { property: "og:title", content: `@${params.username} — Xora` },
      { property: "og:description", content: `Subscribe to @${params.username} on Xora.` },
      { property: "og:type", content: "profile" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { user, signOut } = useAuth();
  const subscriptions = useSubscriptions();
  const { data: profile, isPending } = useQuery(profileQuery(username));
  const { data: posts, isPending: postsPending } = useQuery(profilePostsQuery(profile?.id));
  const isMe = Boolean(user && profile?.id === user.id);

  if (!isPending && !profile) {
    return (
      <AppShell wide>
        <div className="rounded-[30px] border border-border bg-surface p-8 text-center shadow-card">
          <Sparkles className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-semibold">Profile not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">We could not find @{username}.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <div className="mx-auto max-w-2xl space-y-5 pt-12 lg:pt-0">
        <header className="relative overflow-hidden rounded-[30px] border border-border bg-surface shadow-card">
          <div className="h-28 bg-gradient-to-br from-primary/20 via-background to-secondary/70" />
          <div className="relative px-5 pb-5 sm:px-7">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
              <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={82} />
              {isMe ? (
                <div className="flex gap-2">
                  <Link to="/creator-studio" className="press inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary"><PenLine className="size-3.5" /> X Channel</Link>
                  <button type="button" onClick={() => void signOut()} className="press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"><LogOut className="size-3.5" /> Sign out</button>
                </div>
              ) : profile ? (
                <button type="button" onClick={() => subscriptions.toggle(profile.id)} disabled={subscriptions.pending} className={cn("press rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60", subscriptions.isSubscribed(profile.id) ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground")}>
                  {subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{profile?.display_name || username}</h1>
              <p className="mt-1 text-sm text-muted-foreground">@{username}</p>
              {profile?.bio ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">{profile.bio}</p> : null}
            </div>
            <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-background/60">
              {[["Posts", posts?.length ?? 0], ["Subscribers", profile?.subscriber_count ?? 0], ["Subscriptions", profile?.following_count ?? 0]].map(([label, value]) => (
                <div key={String(label)} className="border-r border-border/70 px-2 py-2.5 text-center last:border-r-0">
                  <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{compactNumber(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <div className="space-y-4">
          {postsPending || isPending ? <FeedSkeleton count={2} /> : posts?.length ? posts.map((post) => <PostCard key={post.id} post={post} />) : <EmptyState icon={Sparkles} title="No posts yet" description={isMe ? "Share your first video or thought." : "Nothing published so far."} />}
        </div>
      </div>
    </AppShell>
  );
}
