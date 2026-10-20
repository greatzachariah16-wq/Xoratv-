import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, PenLine, LogOut, MapPin, CalendarDays, Film,
  UserRound, Settings2, ArrowUpRight, PlayCircle, ShieldCheck,
} from "lucide-react";
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
      { title: `@${params.username} — XoraTV` },
      { name: "description", content: `Videos, lessons and posts from @${params.username} on XoraTV.` },
      { property: "og:title", content: `@${params.username} — XoraTV` },
      { property: "og:description", content: `Discover @${params.username} on XoraTV.` },
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
  const publishedPosts = posts ?? [];
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  if (!isPending && !profile) {
    return (
      <AppShell wide>
        <div className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-[28px] border border-border bg-surface p-8 text-center shadow-card sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary"><UserRound className="size-7" /></div>
          <h1 className="mt-4 font-display text-2xl font-semibold">We couldn’t find that profile</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Check the username and try again, or join XoraTV to create your own space.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="press inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card">Create account <ArrowUpRight className="size-4" /></Link>
            <Link to="/" className="press inline-flex items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-secondary">Explore XoraTV</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <main className="mx-auto max-w-5xl space-y-6 pb-8 pt-5 sm:pt-7">
        <section className="relative overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="relative h-36 overflow-hidden sm:h-48">
            <div className="absolute inset-0 bg-gradient-to-br from-clay/25 via-accent to-sage/20" />
            <div className="absolute -right-8 -top-20 size-64 rounded-full border border-primary/10" />
            <div className="absolute -right-1 top-[-4.5rem] size-48 rounded-full border border-primary/15" />
            <div className="absolute bottom-[-4rem] left-[28%] size-40 rounded-full bg-clay/10 blur-2xl" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface/70 to-transparent" />
            <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface/80 px-3 py-1.5 text-[11px] font-semibold text-foreground backdrop-blur sm:left-7">
              <span className="size-1.5 rounded-full bg-sage" /> XoraTV member
            </div>
          </div>

          <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
              <div className="rounded-[25px] border-4 border-surface bg-surface shadow-lift">
                <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={100} />
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {isMe ? (
                  <>
                    <Link to="/settings" className="press inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-semibold hover:bg-secondary sm:px-4">
                      <PenLine className="size-4" /> Edit profile
                    </Link>
                    <Link to="/creator-studio" className="press inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card sm:px-4">
                      <PlayCircle className="size-4" /> X Channel
                    </Link>
                    <button type="button" onClick={() => void signOut()} className="press grid size-10 place-items-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Sign out" title="Sign out">
                      <LogOut className="size-4" />
                    </button>
                  </>
                ) : profile ? (
                  <button
                    type="button"
                    onClick={() => subscriptions.toggle(profile.id)}
                    disabled={subscriptions.pending || !user}
                    title={!user ? "Sign in to subscribe" : undefined}
                    className={cn(
                      "press inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-card disabled:cursor-not-allowed disabled:opacity-70",
                      subscriptions.isSubscribed(profile.id) ? "border border-border bg-background text-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{profile?.display_name || username}</h1>
                  {isMe ? <span className="rounded-full bg-sage/15 px-2.5 py-1 text-[10px] font-semibold text-sage">Your profile</span> : null}
                </div>
                <p className="mt-1 text-sm font-medium text-muted-foreground">@{profile?.username || username}</p>
                {profile?.bio ? <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-foreground/85">{profile.bio}</p> : (
                  <p className="mt-4 text-sm text-muted-foreground">{isMe ? "Add a little introduction so the XoraTV community can get to know you." : "A member of the XoraTV community."}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  {profile?.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{profile.location}</span> : null}
                  {joinedDate ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Joined {joinedDate}</span> : null}
                </div>
              </div>
              <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-background/75 lg:min-w-[300px]">
                {[
                  ["Posts", publishedPosts.length],
                  ["Subscribers", profile?.subscriber_count ?? 0],
                  ["Following", profile?.following_count ?? 0],
                ].map(([label, value], index) => (
                  <div key={String(label)} className={cn("px-3 py-3.5 text-center sm:px-4", index < 2 && "border-r border-border")}>
                    <dd className="font-display text-lg font-bold tabular-nums sm:text-xl">{compactNumber(Number(value))}</dd>
                    <dt className="mt-0.5 text-[10px] font-medium text-muted-foreground sm:text-xs">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {!user ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-accent/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary"><Sparkles className="size-5" /></div>
              <div>
                <h2 className="font-display text-base font-semibold">Make XoraTV yours</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Create a profile to save your favourite videos, follow creators, and share what you love.</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to="/auth" className="press inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Sign up</Link>
              <Link to="/auth" className="press inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Log in</Link>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><Film className="size-4.5" /></div>
                <h2 className="font-display text-lg font-bold">{isMe ? "Your posts" : `Posts by ${profile?.display_name || username}`}</h2>
              </div>
              <p className="mt-1 pl-11 text-xs text-muted-foreground">Videos and posts shared on XoraTV</p>
            </div>
            {isMe ? <Link to="/create" className="press inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:bg-secondary">Create post <ArrowUpRight className="size-3.5" /></Link> : null}
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            {postsPending || isPending ? <FeedSkeleton count={2} /> : publishedPosts.length ? publishedPosts.map((post) => <PostCard key={post.id} post={post} />) : (
              <div className="py-6">
                <EmptyState icon={Sparkles} title={isMe ? "Your story starts here" : "No posts yet"} description={isMe ? "When you publish your first video or post, it will appear here for the community." : "This member hasn’t shared anything publicly yet."} />
                {isMe ? <div className="mt-4 flex justify-center"><Link to="/create" className="press inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><PlayCircle className="size-4" /> Share your first post</Link></div> : null}
              </div>
            )}
          </div>
        </section>

        {isMe ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <Link to="/settings" className="press flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-secondary/60">
              <div className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Settings2 className="size-5" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Profile & preferences</p><p className="mt-1 text-xs text-muted-foreground">Update your account settings</p></div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
            <Link to="/settings" className="press flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-secondary/60">
              <div className="grid size-10 place-items-center rounded-xl bg-sage/15 text-sage"><ShieldCheck className="size-5" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Account security</p><p className="mt-1 text-xs text-muted-foreground">Manage sign-in and security options</p></div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
