import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, CalendarDays, Clapperboard, FileText, Info, PenLine, Share2, Upload, Users } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptions } from "@/hooks/useEngagement";
import { profilePostsQuery, profileQuery } from "@/lib/api";
import { commerceFetch } from "@/lib/commerce";

type ChannelTab = "shorts" | "courses" | "posts" | "about";
type ChannelPost = {
  id: string | number;
  kind?: string;
  source?: string;
  status?: string;
  stream_url?: string | null;
  media_path?: string | null;
  poster_path?: string | null;
  title?: string | null;
  views_count?: number | null;
  created_at?: string | null;
  caption?: string | null;
};
type ChannelCourse = {
  id: string | number;
  status?: string;
  title?: string;
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
  unlockPoints?: number | string | null;
};
type ChannelProfileMedia = {
  cover_image_url?: string | null;
  banner_url?: string | null;
  verified?: boolean;
};

export const Route = createFileRoute("/channel/$username")({ component: PublicChannelPage });

function PublicChannelPage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const subscriptions = useSubscriptions();
  const [activeTab, setActiveTab] = useState<ChannelTab>("shorts");
  const [compactVisible, setCompactVisible] = useState(false);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const { data: profile, isPending: profilePending } = useQuery(profileQuery(username));
  const { data: posts = [], isPending: postsPending } = useQuery(profilePostsQuery(profile?.id));
  const { data: courses = [], isPending: coursesPending } = useQuery({
    queryKey: ["public-channel-courses", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const result = await commerceFetch<{ courses: ChannelCourse[] }>(`/api/commerce/creator/courses?userId=${encodeURIComponent(profile?.id || "")}`);
      return (result.courses || []).filter((course) => course.status === "published");
    },
  });
  const channelProfile = profile as (typeof profile & ChannelProfileMedia) | undefined;\n  const channelPosts = posts as ChannelPost[];\n  const isOwner = Boolean(user && profile && user.id === profile.id);
  const displayName = profile?.display_name || username;
  const avatar = profile?.avatar_url || "";
  const shorts = channelPosts.filter((post) => post.kind === "video" && post.source === "creator" && post.status === "published");
  const textPosts = channelPosts.filter((post) => post.kind === "text" && post.status === "published");
  const followerCount = Number(profile?.subscriber_count || 0);
  const followerLabel = followerCount === 0 ? "New channel" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(followerCount) + " followers";
  const joinedDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
  const coverUrl = String(channelProfile?.cover_image_url || channelProfile?.banner_url || "");
  const tabs: Array<[ChannelTab, string]> = [["shorts", "Shorts"], ["courses", "Courses"], ["posts", "Posts"], ["about", "About"]];
  const activeIndex = Math.max(0, tabs.findIndex(([key]) => key === activeTab));

  useEffect(() => {
    document.documentElement.classList.add("xora-channel-route");
    return () => document.documentElement.classList.remove("xora-channel-route");
  }, []);

  useEffect(() => {
    const target = coverRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCompactVisible(!entry.isIntersecting), {
      threshold: 0,
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [profile?.id]);

  const shareChannel = async () => {
    const url = window.location.href;
    const payload = { title: displayName + " on XoraTV", text: "Discover " + displayName + " on XoraTV.", url };
    if (navigator.share) {
      try { await navigator.share(payload); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt("Copy this channel link", url); }
  };

  const handleSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null || event.target?.closest?.("button,a,input,video")) return;
    const delta = event.changedTouches[0].clientX - start;
    if (Math.abs(delta) < 55) return;
    const next = Math.min(tabs.length - 1, Math.max(0, activeIndex + (delta < 0 ? 1 : -1)));
    if (next !== activeIndex) setActiveTab(tabs[next][0]);
  };

  if (profilePending || (profile && (postsPending || coursesPending))) {
    return <AppShell wide><div className="xora-channel-page space-y-4" aria-busy="true" aria-label="Loading channel">
      <section className="xora-channel-hero"><div className="xora-channel-cover xora-channel-skeleton"/><div className="xora-channel-card"><div className="xora-channel-identity"><div className="xora-channel-avatar-skeleton"/><div className="min-w-0 flex-1 space-y-3"><div className="xora-channel-skeleton h-7 w-2/3 rounded-xl"/><div className="xora-channel-skeleton h-4 w-1/3 rounded-lg"/><div className="xora-channel-skeleton h-4 w-1/2 rounded-lg"/></div></div></div><div className="xora-channel-tabs-skeleton"><span/><span/><span/><span/></div></section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="rounded-2xl border border-border bg-surface p-2"><div className="xora-channel-skeleton aspect-[9/16] rounded-xl"/><div className="xora-channel-skeleton mt-3 h-4 w-3/4 rounded-lg"/><div className="xora-channel-skeleton mt-2 h-3 w-1/2 rounded-lg"/></div>)}</div>
    </div></AppShell>;
  }

  if (!profile) return <AppShell wide><section className="mx-auto mt-8 max-w-2xl rounded-[28px] border border-border bg-surface p-8 text-center shadow-card"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Users className="size-6"/></div><h1 className="mt-4 font-display text-2xl font-semibold">Channel not found</h1><p className="mt-2 text-sm text-muted-foreground">This channel may have moved or is not available.</p><Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Explore XoraTV</Link></section></AppShell>;

  const followerText = followerLabel;
  const handleSubscribe = () => {
    if (!user) { void navigate({ to: "/auth" }); return; }
    void subscriptions.toggle(profile.id);
  };

  return <AppShell wide>
    <div className="xora-channel-page space-y-5" data-compact={compactVisible}>
      <header className="xora-channel-hero">
        <div ref={coverRef} className="xora-channel-cover" style={coverUrl ? { backgroundImage: 'linear-gradient(180deg,rgba(38,23,17,.05),rgba(38,23,17,.4)),url("' + coverUrl + '")' } : undefined}>
          <span className="xora-channel-pill"><Clapperboard className="size-3"/>X CHANNEL</span>
        </div>
        <div className="xora-channel-card">
          <div className="xora-channel-identity">
            <div className="xora-channel-avatar-wrap"><UserAvatar path={avatar} name={displayName} size={88} className="!rounded-full"/>{channelProfile?.verified ? <span className="xora-channel-verified" aria-label="Verified channel"><BadgeCheck className="size-4"/></span> : null}</div>
            <div className="xora-channel-copy"><h1 className="xora-channel-name">{displayName}</h1><p className="xora-channel-handle">@{profile.username || username}</p><p className="xora-channel-followers">{followerText}</p></div>
          </div>
          <div className="xora-channel-actions">
            {isOwner ? <><Link to="/creator-studio" className="xora-channel-primary"><PenLine className="size-4"/>Edit channel</Link><button type="button" onClick={() => void shareChannel()} className="xora-channel-icon-button" aria-label="Share channel"><Share2 className="size-4"/></button></> : <><button type="button" onClick={handleSubscribe} disabled={subscriptions.pending && Boolean(user)} className="xora-channel-primary"><Users className="size-4"/>{subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}</button><button type="button" onClick={() => void shareChannel()} className="xora-channel-icon-button" aria-label="Share channel"><Share2 className="size-4"/></button></>}
          </div>
          <p className="xora-channel-bio">{profile.bio || "Stories, ideas and original videos from XoraTV."}</p>
          <div className="xora-channel-stats"><span><strong>{followerCount === 0 ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(followerCount)}</strong><small>{followerCount === 0 ? "New channel" : "Followers"}</small></span><span><strong>{courses.length}</strong><small>Courses</small></span><span><strong>{shorts.length}</strong><small>Shorts</small></span></div>
        </div>
      </header>
      <nav className="xora-channel-tabs" role="tablist" aria-label="Channel sections">
        {tabs.map(([key, label]) => <button type="button" key={key} id={"xora-channel-tab-" + key} role="tab" aria-selected={activeTab === key} aria-controls="xora-channel-tabpanel" onClick={() => setActiveTab(key)} className="xora-channel-tab">{label}</button>)}
        <span className="xora-channel-tab-indicator" aria-hidden="true" style={{ width: (100 / tabs.length) + "%", transform: "translateX(" + (activeIndex * 100) + "%)" }}/>
      </nav>
      <div className={"xora-channel-compact " + (compactVisible ? "is-visible" : "")} aria-hidden={!compactVisible}><UserAvatar path={avatar} name={displayName} size={34} className="!rounded-full"/><span className="xora-channel-compact-name">{displayName}</span><button type="button" onClick={isOwner ? () => void navigate({ to: "/creator-studio" }) : handleSubscribe}>{isOwner ? "Edit channel" : subscriptions.isSubscribed(profile.id) ? "Subscribed" : "Subscribe"}</button></div>
      <div id="xora-channel-tabpanel" role="tabpanel" aria-labelledby={"xora-channel-tab-" + activeTab} tabIndex={0} className="xora-channel-panel" onTouchStart={(event) => { touchStartX.current = event.changedTouches[0].clientX; }} onTouchEnd={handleSwipe}>
        {activeTab === "shorts" ? shorts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shorts.map((post) => <article key={post.id} className="overflow-hidden rounded-[22px] border border-border bg-surface shadow-card"><div className="aspect-[9/16] max-h-[420px] bg-black"><video src={post.stream_url || post.media_path || ""} poster={post.poster_path || undefined} controls playsInline preload="metadata" className="size-full object-contain"/></div><div className="p-4"><p className="truncate text-sm font-semibold">{post.title || "Untitled Short"}</p><p className="mt-1 text-[11px] text-muted-foreground">{post.views_count || 0} views</p></div></article>)}</div> : <section className="xora-channel-empty"><div className="xora-channel-empty-icon"><Clapperboard className="size-6"/></div><h2>{isOwner ? "Share your first Short" : "No Shorts yet"}</h2><p>{isOwner ? "Upload a video and start building your audience." : "Check back soon."}</p>{isOwner ? <Link to="/create" className="xora-channel-empty-action"><Upload className="size-4"/>Upload Short</a> : null}</section> : null}
        {activeTab === "courses" ? courses.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{courses.map((course) => <article key={course.id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm"><div className="aspect-video overflow-hidden rounded-xl bg-secondary">{(course.thumbnailUrl || course.thumbnail_url) ? <img src={course.thumbnailUrl || course.thumbnail_url || undefined} alt={"Thumbnail for " + course.title} loading="lazy" className="size-full object-cover"/> : <div className="grid size-full place-items-center text-primary"><BookOpen className="size-6"/></div>}</div><h2 className="mt-3 truncate text-sm font-semibold">{course.title}</h2><p className="mt-1 text-xs text-muted-foreground">{Number(course.unlockPoints || 0).toLocaleString()} XP</p></article>)}</div> : <section className="xora-channel-empty"><div className="xora-channel-empty-icon"><BookOpen className="size-6"/></div><h2>No courses yet</h2><p>{isOwner ? "Create a course and share what you know." : "Check back soon."}</p>{isOwner ? <a href="/creator-studio?createCourse=1" className="xora-channel-empty-action"><BookOpen className="size-4"/>Create course</Link> : null}</section> : null}
        {activeTab === "posts" ? textPosts.length ? <div className="space-y-3">{textPosts.map((post) => <article key={post.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm"><div className="flex items-center gap-3"><UserAvatar path={avatar} name={displayName} size={38}/><div><p className="text-sm font-semibold">{displayName}</p><p className="text-[11px] text-muted-foreground">{new Date(post.created_at || Date.now()).toLocaleDateString()}</p></div></div>{post.title ? <h2 className="mt-3 text-base font-semibold">{post.title}</h2> : null}<p className="mt-2 whitespace-pre-wrap text-sm leading-6">{post.caption || " "}</p></article>)}</div> : <section className="xora-channel-empty"><div className="xora-channel-empty-icon"><FileText className="size-6"/></div><h2>{isOwner ? "Share your first post" : "No posts yet"}</h2><p>{isOwner ? "Share an update with your audience." : "Check back soon."}</p>{isOwner ? <Link to="/create" className="xora-channel-empty-action"><FileText className="size-4"/>Create post</Link> : null}</section> : null}
        {activeTab === "about" ? <section className="rounded-2xl border border-border bg-surface p-5 shadow-card"><div className="flex items-center gap-2 text-primary"><Info className="size-4"/><h2 className="text-sm font-semibold uppercase tracking-wide">About this channel</h2></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{profile.bio || "No description added yet."}</p>{joinedDate ? <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4 text-primary"/>Joined {joinedDate}</p> : null}</section> : null}
      </div>
    </div>
  </AppShell>;
}
