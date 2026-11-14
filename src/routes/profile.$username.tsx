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
        <section className="xora-profile-hero">
          <div className="xora-profile-cover" aria-hidden="true" />

          <div className="xora-profile-inner">
            <div className="xora-profile-identity">
              <div className="xora-profile-photo-frame">
                <UserAvatar
                  path={profile?.avatar_url}
                  name={profile?.display_name}
                  size={84}
                  className="xora-profile-avatar !rounded-xl"
                />
                {isMe ? (
                  <span className="xora-profile-camera" title="Your profile">
                    <Camera className="size-3.5" />
                  </span>
                ) : null}
              </div>

              <div className="xora-profile-copy">
                <h1 className="xora-profile-name">{profile?.display_name || username}</h1>
                <div className="xora-profile-handle-row">
                  <p className="xora-profile-handle">@{profile?.username || username}</p>
                  {isMe ? (
                    <span className="xora-profile-owner-label">
                      <BadgeCheck className="size-3.5" />
                      Your profile
                    </span>
                  ) : null}
                </div>

                {profile?.bio ? (
                  <p className="xora-profile-bio">
                    {profileBioSections(profile.bio).about || profileBioSections(profile.bio).creating}
                  </p>
                ) : (
                  <p className="xora-profile-bio">
                    {isMe
                      ? "Add a little introduction so the XoraTV community can get to know you."
                      : "A member of the XoraTV community."}
                  </p>
                )}

                <div className="xora-profile-meta">
                  {profile?.location ? (
                    <span><MapPin className="size-3.5" />{profile.location}</span>
                  ) : null}
                  {joinedDate ? (
                    <span><CalendarDays className="size-3.5" />Joined {joinedDate}</span>
                  ) : null}
                </div>

                <dl className="xora-profile-stats">
                  {[
                    ["Posts", publishedPosts.length],
                    ["Subscribers", profile?.subscriber_count ?? 0],
                    ["Following", profile?.following_count ?? 0],
                  ].map(([label, value]) => (
                    <div className="xora-profile-stat" key={String(label)}>
                      <dd>{compactNumber(Number(value))}</dd>
                      <dt>{String(label)}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="xora-profile-actions">
              {isMe ? (
                <>
                  <Link to="/edit-profile" className="xora-profile-action xora-profile-action--soft">
                    <PenLine className="size-4" />
                    <span>Edit profile</span>
                  </Link>
                  <Link to="/creator-studio" className="xora-profile-action xora-profile-action--primary">
                    <PlayCircle className="size-4" />
                    <span>X Channel</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="xora-profile-action xora-profile-action--icon"
                    aria-label="Sign out"
                    title={signingOut ? "Signing out…" : "Sign out"}
                  >
                    <LogOut className="size-4" />
                  </button>
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
                    className="xora-profile-action xora-profile-action--soft"
                  >
                    <MessageCircle className="size-4" /> Message
                  </button>
                  <button
                    type="button"
                    onClick={() => subscriptions.toggle(profile.id)}
                    disabled={subscriptions.pending || !user}
                    title={!user ? "Sign in to subscribe" : undefined}
                    className={cn(
                      "xora-profile-action",
                      subscriptions.isSubscribed(profile.id)
                        ? "xora-profile-action--soft"
                        : "xora-profile-action--primary",
                    )}
                  >
                    <Users className="size-4" />
                    {subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}
                  </button>
                </>
              ) : null}
            </div>

            <div className="xora-profile-tabs" role="tablist" aria-label="Profile sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "posts"}
                onClick={() => setActiveTab("posts")}
                className={cn("xora-profile-tab", activeTab === "posts" && "is-active")}
              >
                Posts <span>{publishedPosts.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "about"}
                onClick={() => setActiveTab("about")}
                className={cn("xora-profile-tab", activeTab === "about" && "is-active")}
              >
                About
              </button>
            </div>
          </div>
        </section>

        {!user ? <section className="soft-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-surface text-primary shadow-sm"><Sparkles className="size-5" /></div><div><h2 className="font-display text-base font-semibold">Make XoraTV yours</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Create a profile to follow creators and share what you love with the community.</p></div></div>
          <div className="flex shrink-0 gap-2"><Link to="/auth" className="brand-surface press inline-flex h-11 items-center justify-center rounded-full px-4 text-[13px] font-semibold">Sign up</Link><Link to="/auth" className="soft-pill press inline-flex h-11 items-center justify-center rounded-full px-4 text-[13px] font-semibold">Log in</Link></div>
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
            </> : <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3"><div className="peach-tile grid size-11 place-items-center rounded-2xl text-clay"><CircleUserRound className="size-5" /></div><div><h2 className="font-display text-[18px] font-bold text-ink">About {profile?.display_name || username}</h2><p className="mt-1 text-[13px] text-muted">A little more about this XoraTV member</p></div></div>
              <div className="mt-4 space-y-2">
                <div className="inset-field rounded-2xl border-0 p-3.5"><p className="text-[12px] font-semibold uppercase tracking-wide text-muted">What are you about?</p><p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-5 text-ink">{profileBioSections(profile?.bio).about || (isMe ? "Your description is empty for now." : "No description added yet.")}</p></div>{profileBioSections(profile?.bio).creating ? <div className="inset-field rounded-2xl border-0 p-3.5"><p className="text-[12px] font-semibold uppercase tracking-wide text-muted">What are you creating?</p><p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-5 text-ink">{profileBioSections(profile?.bio).creating}</p></div> : null}
                {profile?.location ? <div className="inset-field flex items-center gap-3 rounded-2xl border-0 p-3.5"><MapPin className="size-4 text-clay" /><div><p className="text-[13px] text-muted">Location</p><p className="mt-0.5 text-[14px] font-medium text-ink">{profile.location}</p></div></div> : null}
                {joinedDate ? <div className="inset-field flex items-center gap-3 rounded-2xl border-0 p-3.5"><CalendarDays className="size-4 text-clay" /><div><p className="text-[13px] text-muted">Member since</p><p className="mt-0.5 text-[14px] font-medium text-ink">{joinedDate}</p></div></div> : null}
                {isMe ? <Link to="/settings" className="brand-surface press mt-2 inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold">Update profile <PenLine className="size-4" /></Link> : null}
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
