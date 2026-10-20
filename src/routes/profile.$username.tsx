import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, PenLine, LogOut, MapPin, CalendarDays, Film, UserRound,
  Settings2, ArrowUpRight, PlayCircle, ShieldCheck, Grid2X2, CircleUserRound,
  Clapperboard, ChevronRight, Users, Heart, Camera, BadgeCheck,
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
      <main className="mx-auto max-w-6xl space-y-5 pb-10 pt-4 sm:space-y-6 sm:pt-7">
        {/* Cinematic member cover */}
        <section className="relative isolate overflow-hidden rounded-[28px] border border-border bg-surface shadow-card sm:rounded-[32px]">
          <div className="relative h-40 overflow-hidden sm:h-56 lg:h-64">
            <div className="absolute inset-0 bg-gradient-to-br from-clay/50 via-accent to-sage/35" />
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(ellipse at 16% 12%, hsl(var(--primary) / .15), transparent 38%), radial-gradient(ellipse at 82% 22%, hsl(var(--clay) / .35), transparent 34%), linear-gradient(125deg, transparent 30%, hsl(var(--surface) / .38) 100%)" }} />
            <div className="absolute -right-10 -top-24 size-72 rounded-full border border-primary/15 sm:size-96" />
            <div className="absolute -right-2 -top-16 size-56 rounded-full border border-primary/20 sm:size-72" />
            <div className="absolute right-[18%] top-8 size-24 rounded-full border border-surface/40 bg-surface/10 backdrop-blur-sm sm:size-36" />
            <div className="absolute -bottom-16 left-[22%] h-36 w-72 rounded-full bg-clay/30 blur-3xl sm:h-48 sm:w-96" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface/90 via-surface/25 to-transparent" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-surface/50 bg-surface/65 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-foreground shadow-sm backdrop-blur-xl sm:left-7 sm:top-6 sm:text-xs">
              <span className="size-1.5 rounded-full bg-sage" /> XoraTV MEMBER LOUNGE
            </div>
            <div className="absolute bottom-4 right-4 hidden items-center gap-2 rounded-full border border-surface/50 bg-surface/55 px-3 py-2 text-xs text-foreground/80 backdrop-blur-xl sm:flex">
              <Sparkles className="size-3.5 text-primary" /> Your corner of XoraTV
            </div>
          </div>

          <div className="relative px-4 pb-5 sm:px-7 sm:pb-7 lg:px-9">
            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-[68px]">
              <div className="relative shrink-0 rounded-[27px] border-[5px] border-surface bg-surface shadow-lift sm:rounded-[32px] sm:border-[6px]">
                <UserAvatar path={profile?.avatar_url} name={profile?.display_name} size={112} />
                {isMe ? <span className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full border-2 border-surface bg-primary text-primary-foreground shadow-card" title="Your profile"><Camera className="size-3.5" /></span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {isMe ? (
                  <>
                    <Link to="/edit-profile" className="press inline-flex items-center gap-2 rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-xs font-semibold shadow-sm backdrop-blur-xl transition hover:bg-secondary sm:px-4 sm:text-sm"><PenLine className="size-4" /> Edit profile</Link>
                    <Link to="/creator-studio" className="press inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition hover:opacity-90 sm:px-4 sm:text-sm"><PlayCircle className="size-4" /> X Channel</Link>
                    <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="press inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface/75 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-xl transition hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm" aria-label="Sign out" title="Sign out"><LogOut className="size-4" />{signingOut ? "Signing out…" : "Sign out"}</button>
                  </>
                ) : profile ? (
                  <button type="button" onClick={() => subscriptions.toggle(profile.id)} disabled={subscriptions.pending || !user || isMe} title={isMe ? "This is your profile" : !user ? "Sign in to subscribe" : undefined} className={cn("press inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-card transition disabled:cursor-not-allowed disabled:opacity-70", subscriptions.isSubscribed(profile.id) ? "border border-border bg-surface text-foreground" : "bg-primary text-primary-foreground hover:opacity-90")}>
                    <Users className="size-4" /> {isMe ? "Your profile" : subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-end">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="break-words font-display text-[27px] font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">{profile?.display_name || username}</h1>
                  {isMe ? <span className="inline-flex items-center gap-1 rounded-full bg-sage/15 px-2.5 py-1 text-[10px] font-semibold text-sage"><BadgeCheck className="size-3.5" /> Your profile</span> : null}
                </div>
                <p className="mt-1.5 text-sm font-medium text-muted-foreground">@{profile?.username || username}</p>
                {profile?.bio ? <div className="mt-4 max-w-2xl space-y-2 text-sm leading-7 text-foreground/85 sm:text-[15px]">{profileBioSections(profile.bio).about ? <p className="whitespace-pre-wrap">{profileBioSections(profile.bio).about}</p> : null}{profileBioSections(profile.bio).creating ? <p className="whitespace-pre-wrap"><span className="font-semibold text-muted-foreground">Creating · </span>{profileBioSections(profile.bio).creating}</p> : null}</div> : <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{isMe ? "Add a little introduction so the XoraTV community can get to know you." : "A member of the XoraTV community."}</p>}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  {profile?.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" />{profile.location}</span> : null}
                  {joinedDate ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5 text-primary" />Joined {joinedDate}</span> : null}
                </div>
              </div>
              <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border/80 bg-background/55 shadow-sm backdrop-blur-xl lg:min-w-0">
                {[
                  ["Posts", publishedPosts.length, Grid2X2],
                  ["Subscribers", profile?.subscriber_count ?? 0, Users],
                  ["Following", profile?.following_count ?? 0, Heart],
                ].map(([label, value, Icon], index) => {
                  const StatIcon = Icon as typeof Grid2X2;
                  return <div key={String(label)} className={cn("px-2 py-3.5 text-center sm:px-3 sm:py-4", index < 2 && "border-r border-border/80")}>
                    <dd className="font-display text-xl font-bold tabular-nums sm:text-2xl">{compactNumber(Number(value))}</dd>
                    <dt className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground sm:text-xs"><StatIcon className="hidden size-3.5 sm:block" />{String(label)}</dt>
                  </div>;
                })}
              </dl>
            </div>

            {/* Real-data tabs only: no fabricated watch history or playlists */}
            <div className="mt-7 flex items-center gap-1 overflow-x-auto border-t border-border/80 pt-3">
              <button type="button" onClick={() => setActiveTab("posts")} className={cn("relative inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition", activeTab === "posts" ? "bg-accent/70 text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground")}>
                <Clapperboard className="size-4" /> Posts <span className="rounded-full bg-surface/80 px-1.5 py-0.5 text-[10px] tabular-nums">{publishedPosts.length}</span>
                {activeTab === "posts" ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </button>
              <button type="button" onClick={() => setActiveTab("about")} className={cn("relative inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition", activeTab === "about" ? "bg-accent/70 text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground")}>
                <CircleUserRound className="size-4" /> About
                {activeTab === "about" ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </button>
            </div>
          </div>
        </section>

        {!user ? <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-accent/45 p-5 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3.5"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-surface text-primary shadow-sm"><Sparkles className="size-5" /></div><div><h2 className="font-display text-base font-semibold">Make XoraTV yours</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Create a profile to follow creators and share what you love with the community.</p></div></div>
          <div className="flex shrink-0 gap-2"><Link to="/auth" className="press inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Sign up</Link><Link to="/auth" className="press inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Log in</Link></div>
        </section> : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 overflow-hidden rounded-[26px] border border-border bg-surface/90 shadow-card backdrop-blur-xl sm:rounded-[30px]">
            {activeTab === "posts" ? <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
                <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-accent text-primary"><Film className="size-5" /></div><div><h2 className="font-display text-lg font-bold">{isMe ? "Your posts" : `Posts by ${profile?.display_name || username}`}</h2><p className="mt-0.5 text-xs text-muted-foreground">The latest things shared with the community</p></div></div>
                {isMe ? <Link to="/create" className="press inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-semibold transition hover:bg-secondary">Create post <ArrowUpRight className="size-3.5" /></Link> : null}
              </div>
              <div className="space-y-4 p-3 sm:p-5">
                {postsPending || isPending ? <FeedSkeleton count={2} /> : publishedPosts.length ? publishedPosts.map((post) => <PostCard key={post.id} post={post} />) : <div className="px-2 py-8 sm:px-5"><EmptyState icon={Sparkles} title={isMe ? "Your story starts here" : "No posts yet"} description={isMe ? "When you publish your first video or post, it will appear here for the community." : "This member hasn’t shared anything publicly yet."} />{isMe ? <div className="mt-5 flex justify-center"><Link to="/create" className="press inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><PlayCircle className="size-4" /> Share your first post</Link></div> : null}</div>}
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

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-[26px] border border-border bg-surface/75 shadow-card backdrop-blur-xl">
              <div className="border-b border-border/80 px-5 py-4"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-display text-base font-bold">{isMe ? "Your space" : "Member snapshot"}</h2></div><p className="mt-1 text-xs text-muted-foreground">Your XoraTV profile at a glance</p></div>
              <div className="p-4">
                <div className="flex items-center gap-3 rounded-2xl bg-accent/45 p-3.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary"><Clapperboard className="size-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{compactNumber(publishedPosts.length)} posts shared</p><p className="mt-0.5 text-xs text-muted-foreground">Visible on this profile</p></div></div>
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-sage/10 p-3.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-sage"><Users className="size-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{compactNumber(profile?.subscriber_count ?? 0)} subscribers</p><p className="mt-0.5 text-xs text-muted-foreground">Community connections</p></div></div>
                {isMe ? <Link to="/creator-studio" className="press mt-4 flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-card transition hover:opacity-90"><span className="flex items-center gap-2"><PlayCircle className="size-4" /> Open X Channel</span><ChevronRight className="size-4" /></Link> : null}
              </div>
            </section>
            {isMe ? <section className="overflow-hidden rounded-[26px] border border-border bg-surface/75 shadow-card backdrop-blur-xl">
              <div className="border-b border-border/80 px-5 py-4"><h2 className="font-display text-base font-bold">Account shortcuts</h2><p className="mt-1 text-xs text-muted-foreground">Manage your account and preferences</p></div>
              <div className="p-2.5">
                <Link to="/settings" className="press flex items-center gap-3 rounded-2xl p-3 transition hover:bg-secondary/70"><div className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Settings2 className="size-4.5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Profile & preferences</p><p className="mt-0.5 text-xs text-muted-foreground">Personalise your account</p></div><ArrowUpRight className="size-4 text-muted-foreground" /></Link>
                <Link to="/settings" className="press flex items-center gap-3 rounded-2xl p-3 transition hover:bg-secondary/70"><div className="grid size-10 place-items-center rounded-xl bg-sage/15 text-sage"><ShieldCheck className="size-4.5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Account security</p><p className="mt-0.5 text-xs text-muted-foreground">Sign-in and security options</p></div><ArrowUpRight className="size-4 text-muted-foreground" /></Link>
              </div>
            </section> : <section className="rounded-[26px] border border-border bg-gradient-to-br from-accent/60 via-surface/80 to-sage/15 p-5 shadow-card"><div className="grid size-10 place-items-center rounded-2xl bg-surface text-primary shadow-sm"><Heart className="size-5" /></div><h2 className="mt-4 font-display text-base font-bold">Find your people</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">Follow creators and discover more of what you love across XoraTV.</p><Link to="/" className="press mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Explore XoraTV <ArrowUpRight className="size-4" /></Link></section>}
            <p className="px-2 text-[11px] leading-5 text-muted-foreground">XoraTV · A space for the stories, creators, and videos you love.</p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
