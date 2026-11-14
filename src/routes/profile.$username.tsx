import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, PenLine, LogOut, MapPin, CalendarDays, UserRound,
  Settings2, ArrowUpRight, PlayCircle, ShieldCheck, CircleUserRound,
  ChevronRight, Users, Heart, Camera, BadgeCheck, MessageCircle,
} from "lucide-react";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptions } from "@/hooks/useEngagement";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
import { UserAvatar } from "@/components/xora/UserAvatar";
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

type ProfileTab = "posts" | "about";

function profileBioSections(value?: string | null) {
  const lines = (value || "").split("\\n");
  const about = lines.find((line) => line.startsWith("About: "));
  const creating = lines.find((line) => line.startsWith("Creating: "));
  if (about || creating) {
    return { about: about?.slice(7) || "", creating: creating?.slice(10) || "" };
  }
  return { about: value || "", creating: "" };
}

function ProfilePage() {
  const { username } = Route.useParams();
  const { user, profile: authProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const subscriptions = useSubscriptions();
  const { data: profile, isPending } = useQuery(profileQuery(username));
  const { data: posts, isPending: postsPending } = useQuery(profilePostsQuery(profile?.id));
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const isMe = Boolean(user && (profile?.id === user.id || authProfile?.username?.toLowerCase() === username.toLowerCase()));
  const publishedPosts = posts ?? [];
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      toast.success("You’ve signed out of XoraTV.");
      await navigate({ to: "/auth" });
    } catch {
      toast.error("Couldn’t sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  if (!isPending && !profile) {
    return (
      <AppShell wide>
        <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-[30px] border border-border bg-surface p-8 text-center shadow-card sm:p-12">
          <div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-accent text-primary"><UserRound className="size-7" /></div>
          <h1 className="mt-5 font-display text-2xl font-semibold">We couldn’t find that profile</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Check the username and try again, or join XoraTV to create your own space.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="press inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Create account <ArrowUpRight className="size-4" /></Link>
            <Link to="/" className="press inline-flex items-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-secondary">Explore XoraTV</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <main className="xora-profile-page page-bg mx-auto max-w-6xl space-y-3 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 sm:space-y-4 sm:pt-5">
        {/* Cinematic member cover */}
        <section className="xora-profile-hero soft-card relative isolate overflow-hidden">
          <div className="h-[72px] bg-gradient-to-r from-[#f5d7c7] via-[#f1c8b5] to-[#f8e5d9]" />

          <div className="relative px-3 pb-2 sm:px-5 sm:pb-3">
            <div className="-mt-10 flex min-w-0 flex-col gap-0.5">
              <div className="relative h-10">
                <div className="absolute left-0 top-0 size-20 rounded-full border-[3px] border-white bg-white shadow-[0_0_0_3px_#fff,0_6px_14px_-6px_rgba(120,60,30,.4)]">
                  <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={74} />
                  {isMe ? <span className="brand-surface absolute bottom-0 right-0 grid size-7 place-items-center rounded-full border-2 border-white" title="Your profile"><Camera className="size-3.5" /></span> : null}
                </div>
              </div>
              <div className="flex h-11 min-w-0 flex-nowrap items-center justify-end gap-1.5 pb-0.5">
                {isMe ? (
                  <>
                    <Link to="/edit-profile" className="soft-pill press inline-flex h-11 min-w-0 items-center justify-center gap-1 rounded-full px-3 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-clay/40"><PenLine className="size-4 shrink-0" /><span className="whitespace-nowrap">Edit profile</span></Link>
                    <Link to="/creator-studio" className="brand-surface press inline-flex h-11 min-w-0 items-center justify-center gap-1 rounded-full px-3 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-clay/40"><PlayCircle className="size-4 shrink-0" /><span className="whitespace-nowrap">X Channel</span></Link>
                    <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="soft-pill press inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-clay/40 disabled:opacity-60" aria-label="Sign out" title={signingOut ? "Signing out…" : "Sign out"}><LogOut className="size-4" /></button>
                  </>
                ) : profile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          void navigate({ to: "/auth" });
                          return;
                        }
                        window.location.assign(`/chat?to=${encodeURIComponent(profile.username || username)}`);
                      }}
                      className="xora-profile-message press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
                    >
                      <MessageCircle className="size-4" /> Message
                    </button>
                    <button type="button" onClick={() => subscriptions.toggle(profile.id)} disabled={subscriptions.pending || !user} title={!user ? "Sign in to subscribe" : undefined} className={cn("press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70", subscriptions.isSubscribed(profile.id) ? "xora-profile-secondary" : "xora-profile-primary")}>
                      <Users className="size-4" /> {subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-1 grid gap-1">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
                  <h1 className="break-words font-display text-[28px] font-extrabold leading-7 tracking-tight">{profile?.display_name || username}</h1>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-muted-foreground">@{profile?.username || username}</p>
                  {isMe ? <span className="inset-field inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-clay"><BadgeCheck className="size-3.5" />Your profile</span> : null}
                </div>
                {profile?.bio ? <div className="mt-1 max-w-2xl space-y-0 text-[14px] leading-4 text-ink"><p className="line-clamp-2 whitespace-pre-wrap">{profileBioSections(profile.bio).about || profileBioSections(profile.bio).creating}</p></div> : <p className="mt-1 max-w-xl line-clamp-2 text-[14px] leading-4 text-muted">{isMe ? "Add a little introduction so the XoraTV community can get to know you." : "A member of the XoraTV community."}</p>}
                <div className="mt-1 flex flex-nowrap gap-x-3 overflow-hidden whitespace-nowrap text-[13px] text-muted">
                  {profile?.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" />{profile.location}</span> : null}
                  {joinedDate ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5 text-primary" />Joined {joinedDate}</span> : null}
                </div>
              </div>
              <dl className="inset-field grid h-16 grid-cols-3 overflow-hidden rounded-2xl border-0 shadow-none">
                {[
                  ["Posts", publishedPosts.length],
                  ["Subscribers", profile?.subscriber_count ?? 0],
                  ["Following", profile?.following_count ?? 0],
                ].map(([label, value], index) => {
                  return <div key={String(label)} className={cn("flex flex-col justify-center px-2 py-1 text-center", index < 2 && "border-r border-[rgba(120,60,30,.1)]")}>
                    <dd className="font-display text-xl font-bold leading-6 tabular-nums text-ink">{compactNumber(Number(value))}</dd>
                    <dt className="mt-0.5 text-[12px] font-medium text-muted">{String(label)}</dt>
                  </div>;
                })}
              </dl>
            </div>

            {/* Real-data tabs only: no fabricated watch history or playlists */}
            <div className="mt-1 flex h-11 items-center gap-1 rounded-full bg-[#f5ede6] p-1">
              <button type="button" onClick={() => setActiveTab("posts")} className={cn("press inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-clay/40", activeTab === "posts" ? "soft-pill text-clay" : "text-muted")}>
                Posts <span className="inset-field rounded-full px-1.5 py-0.5 text-[11px] tabular-nums">{publishedPosts.length}</span>
              </button>
              <button type="button" onClick={() => setActiveTab("about")} className={cn("press inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-clay/40", activeTab === "about" ? "soft-pill text-clay" : "text-muted")}>
                About
              </button>
            </div>
          </div>
        </section>

        {!user ? <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-accent/45 p-5 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3.5"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-surface text-primary shadow-sm"><Sparkles className="size-5" /></div><div><h2 className="font-display text-base font-semibold">Make XoraTV yours</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Create a profile to follow creators and share what you love with the community.</p></div></div>
          <div className="flex shrink-0 gap-2"><Link to="/auth" className="press inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Sign up</Link><Link to="/auth" className="press inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Log in</Link></div>
        </section> : null}

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="soft-card min-w-0 overflow-hidden">
            {activeTab === "posts" ? <>
              <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-2">
                <div className="min-w-0"><h2 className="font-display text-[18px] font-bold tracking-tight text-ink">{isMe ? "Your posts" : `Posts by ${profile?.display_name || username}`}</h2><p className="mt-0.5 truncate text-[13px] text-muted">The latest things shared with the community</p></div>
                {isMe && publishedPosts.length > 0 ? <Link to="/create" className="soft-pill press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-clay/40">Create post <ArrowUpRight className="size-3.5" /></Link> : null}
              </div>
              <div className="space-y-3 p-0">
                {postsPending || isPending ? <FeedSkeleton count={2} /> : publishedPosts.length ? publishedPosts.map((post) => <PostCard key={post.id} post={post} />) : <div className="flex flex-col items-center px-4 py-2 text-center">
                  {isMe ? <><div className="relative mb-1.5 grid size-12 place-items-center rounded-2xl peach-tile text-clay before:absolute before:-inset-2 before:-z-10 before:rounded-[22px] before:border before:border-clay/10"><Sparkles className="size-6" /></div><h3 className="font-display text-[18px] font-bold text-ink">Your story starts here</h3><p className="mt-1 max-w-[270px] text-[14px] leading-5 text-muted">Your first post will appear here.</p><Link to="/create" className="brand-surface press mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-clay/40"><PlayCircle className="size-4" /> Share your first post</Link></> : <div className="py-4"><h3 className="font-display text-[18px] font-bold text-ink">No posts yet</h3><p className="mt-1 text-[14px] text-muted">This member hasn’t shared anything publicly yet.</p></div>}
                </div>}
              </div>
            </> : <div className="p-5 sm:p-7">
              <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-accent text-primary"><CircleUserRound className="size-5" /></div><div><h2 className="font-display text-xl font-bold">About {profile?.display_name || username}</h2><p className="mt-1 text-sm text-muted-foreground">A little more about this XoraTV member</p></div></div>
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-border/80 bg-background/60 p-4"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">What are you about?</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{profileBioSections(profile?.bio).about || (isMe ? "Your description is empty for now." : "No description added yet.")}</p></div>{profileBioSections(profile?.bio).creating ? <div className="rounded-2xl border border-border/80 bg-background/60 p-4"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">What are you creating?</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{profileBioSections(profile?.bio).creating}</p></div> : null}
                {profile?.location ? <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/60 p-4"><MapPin className="size-4 text-primary" /><div><p className="text-xs text-muted-foreground">Location</p><p className="mt-1 text-sm font-medium">{profile.location}</p></div></div> : null}
                {joinedDate ? <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/60 p-4"><CalendarDays className="size-4 text-primary" /><div><p className="text-xs text-muted-foreground">Member since</p><p className="mt-1 text-sm font-medium">{joinedDate}</p></div></div> : null}
                {isMe ? <Link to="/settings" className="press mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Update profile <PenLine className="size-4" /></Link> : null}
              </div>
            </div>}
          </section>

          <aside className="space-y-3">
            {isMe ? <section className="soft-card flex min-h-[72px] items-center gap-3 px-3.5 py-3">
              <div className="peach-tile grid size-10 shrink-0 place-items-center rounded-2xl text-clay"><Sparkles className="size-5" /></div>
              <h2 className="min-w-0 flex-1 text-[16px] font-bold text-ink">Your space</h2>
              <Link to="/creator-studio" className="soft-pill press inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-clay focus-visible:ring-2 focus-visible:ring-clay/40">Open X Channel <ChevronRight className="size-4" /></Link>
            </section> : null}
            {isMe ? <section className="soft-card overflow-hidden px-4 py-2">
              <p className="pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Account</p>
              <Link to="/settings" className="press flex h-[60px] items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-clay/40">
                <div className="peach-tile grid size-10 shrink-0 place-items-center rounded-2xl text-clay"><Settings2 className="size-[18px]" /></div><div className="min-w-0 flex-1"><p className="text-[16px] font-semibold text-ink">Profile & preferences</p><p className="truncate text-[13px] text-muted">Personalise your account</p></div><ChevronRight className="size-4 text-muted" />
              </Link>
              <div className="ml-0 h-px bg-[rgba(120,60,30,.08)]" />
              <Link to="/settings" className="press flex h-[60px] items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-clay/40">
                <div className="peach-tile grid size-10 shrink-0 place-items-center rounded-2xl text-clay"><ShieldCheck className="size-[18px]" /></div><div className="min-w-0 flex-1"><p className="text-[16px] font-semibold text-ink">Account security</p><p className="truncate text-[13px] text-muted">Sign-in and security options</p></div><ChevronRight className="size-4 text-muted" />
              </Link>
            </section> : <section className="soft-card p-4"><div className="peach-tile grid size-10 place-items-center rounded-2xl text-clay"><Heart className="size-5" /></div><h2 className="mt-3 text-[16px] font-bold text-ink">Find your people</h2><p className="mt-1 text-[13px] leading-5 text-muted">Follow creators and discover more of what you love across XoraTV.</p><Link to="/" className="soft-pill press mt-3 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-clay">Explore XoraTV <ChevronRight className="size-4" /></Link></section>}
            <p className="px-2 text-center text-[12px] leading-5 text-muted">XoraTV · A space for the stories, creators, and videos you love.</p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
