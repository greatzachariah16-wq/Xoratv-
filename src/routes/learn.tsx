import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Bookmark, PlayCircle, Sparkles, GraduationCap, X, ChevronRight, LockKeyhole, BookOpen, Loader2, CheckCircle2 } from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { commerceFetch, coursesMarketQuery, purchasedCoursesQuery, xoraPointsQuery, type Course } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/learn")({ component: Learn });

function requiredPoints(course: Course, value: number) {
  return Math.max(1, Math.round(Number(course.unlockPoints) || Math.ceil(Number(course.price || 0) / Math.max(value, 0.0001))));
}

function Learn() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All courses");
  const [saved, setSaved] = useState<string[]>([]);
  const [active, setActive] = useState<Course | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isPending, refetch } = useQuery(coursesMarketQuery());
  const points = useQuery(xoraPointsQuery(user?.id));
  const purchased = useQuery(purchasedCoursesQuery(user?.id));
  const courses = data?.courses || [];
  const balance = Number(points.data?.wallet?.points || 0);
  const pointValue = Number(points.data?.wallet?.pointsNgnValue || 0.1);
  const owned = useMemo(() => new Set([...(purchased.data?.courseIds || []), ...unlocked]), [purchased.data, unlocked]);
  const categories = useMemo(() => ["All courses", ...new Set(courses.map(c => String(c.category || "").trim()).filter(Boolean))], [courses]);
  const filtered = useMemo(() => courses.filter(c => {
    const term = search.trim().toLowerCase();
    const matchCategory = category === "All courses" || String(c.category || "").toLowerCase() === category.toLowerCase();
    const matchSearch = !term || [c.title,c.description,c.creatorDisplayName,c.creatorUsername,c.category,c.level].some(v => String(v || "").toLowerCase().includes(term));
    return matchCategory && matchSearch;
  }).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), [courses, category, search]);
  const featured = filtered[0] || courses[0] || null;
  const filtering = Boolean(search.trim()) || category !== "All courses";

  async function unlock(course: Course) {
    if (!user) { window.location.href = "/auth"; return; }
    const needed = requiredPoints(course, pointValue);
    if (balance < needed) {
      setNotice("You need " + needed.toLocaleString() + " Xora Points. Earn points through eligible CPA participation in Rewards, then return to unlock this course.");
      return;
    }
    setBusy(course.id); setNotice("");
    try {
      const result = await commerceFetch<any>("/api/commerce/course/order", { method: "POST", body: JSON.stringify({ userId: user.id, courseId: course.id, paymentMethod: "points" }) });
      setUnlocked(list => list.includes(course.id) ? list : [...list, course.id]);
      await Promise.all([points.refetch(), purchased.refetch(), refetch()]);
      setNotice("Course unlocked! " + Number(result.order?.pointsRedeemed || needed).toLocaleString() + " Xora Points redeemed.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not unlock this course. Please try again.");
      await points.refetch();
    } finally { setBusy(null); }
  }

  function card(course: Course) {
    const isOwned = owned.has(course.id);
    const needed = requiredPoints(course, pointValue);
    return <article key={course.id} className="group min-w-0 overflow-hidden rounded-[20px] border border-border bg-surface shadow-sm transition hover:shadow-card">
      <button onClick={() => setActive(course)} className="relative block aspect-[4/3] w-full overflow-hidden bg-secondary text-left">
        {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt={"Thumbnail for " + course.title} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"/> : <div className="grid size-full place-items-center bg-gradient-to-br from-primary/15 via-secondary to-accent/20"><BookOpen className="size-8 text-primary/60"/></div>}
        <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-lg border border-white/20 bg-black/50 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur">{course.category || "Creator course"}</span>
        <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/85 text-foreground shadow-sm"><PlayCircle className="size-4"/></span>
        {isOwned ? <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white">Unlocked</span> : null}
      </button>
      <div className="p-3 sm:p-3.5">
        <div className="flex items-center gap-1.5"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">{String(course.creatorDisplayName || "X").split(/\s+/).map(v=>v[0]).join("").slice(0,2).toUpperCase()}</span><span className="min-w-0 truncate text-[10px] font-medium text-muted-foreground">{course.creatorDisplayName || "Xora Creator"}</span><button aria-label="Save course" aria-pressed={saved.includes(course.id)} onClick={() => setSaved(list => list.includes(course.id) ? list.filter(v=>v!==course.id) : [...list,course.id])} className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-primary"><Bookmark className={"size-3.5 " + (saved.includes(course.id) ? "fill-primary text-primary" : "")}/></button></div>
        <button onClick={() => setActive(course)} className="mt-2 block w-full text-left"><h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-bold leading-snug sm:text-sm">{course.title}</h3><p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[10px] leading-4 text-muted-foreground">{course.description}</p></button>
        <div className="mt-2 flex items-center justify-between gap-1"><span className="truncate text-[10px] text-muted-foreground">{course.level || "Self-paced"}</span><span className="shrink-0 text-[10px] font-bold text-primary"><Sparkles className="mr-1 inline size-3"/>{needed.toLocaleString()} XP</span></div>
        <button disabled={busy===course.id} onClick={() => isOwned ? setActive(course) : void unlock(course)} className={"mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[11px] font-bold transition disabled:opacity-60 " + (isOwned ? "bg-emerald-600/10 text-emerald-700" : "bg-primary text-primary-foreground shadow-sm")}>{busy===course.id ? <Loader2 className="size-3.5 animate-spin"/> : isOwned ? <PlayCircle className="size-3.5"/> : <LockKeyhole className="size-3.5"/>}{busy===course.id ? "Unlocking…" : isOwned ? "Start learning" : "Unlock with points"}</button>
      </div>
    </article>;
  }

  return <AppShell rail={<TrendingRail/>} wide>
    <div className="mx-auto min-w-0 max-w-5xl space-y-5 pb-8 sm:space-y-7">
      <header className="sticky top-0 z-20 -mx-1 border-b border-border/60 bg-background/90 px-1 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><GraduationCap className="size-5"/></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-display text-xl font-semibold">Xora<span className="text-primary">TV</span></span><span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">Learn</span></div><p className="text-[11px] text-muted-foreground">Skills taught by Xora creators</p></div>{user?<div className="hidden rounded-xl border border-border bg-surface px-3 py-2 text-right sm:block"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Your balance</p><p className="text-sm font-bold text-primary">{balance.toLocaleString()} XP</p></div>:null}<Link to="/creator-studio?createCourse=1" aria-label="Create a course in X Channel" className="hidden h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[11px] font-semibold text-foreground transition hover:bg-secondary sm:inline-flex">Teach on XoraTV</Link><Link to="/rewards" aria-label="Earn Xora Points" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary"><Sparkles className="size-4"/></Link></div>
        <label className="mt-3 flex h-11 items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><Search className="size-4 shrink-0 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="What do you want to learn?" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"/>{search?<button aria-label="Clear search" onClick={()=>setSearch("")}><X className="size-4"/></button>:null}</label>
      </header>
      {notice?<div role="status" className="flex items-start gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-3.5 text-xs leading-5"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary"/><p className="flex-1">{notice}</p><button aria-label="Dismiss" onClick={()=>setNotice("")}><X className="size-4"/></button></div>:null}
      {!filtering && featured ? <button onClick={()=>setActive(featured)} className="group relative block w-full overflow-hidden rounded-[26px] border border-border bg-foreground text-left text-white shadow-card">
        {featured.thumbnailUrl?<img src={featured.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.025]"/>:<div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-foreground to-accent/40"/>}<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/5"/>
        <div className="relative flex min-h-[300px] flex-col justify-end p-4 sm:min-h-[360px] sm:p-7"><span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.18em] backdrop-blur"><Sparkles className="size-3"/>Featured course</span><p className="text-[11px] font-semibold text-white/75">{featured.category || "Xora creator course"}{featured.level ? " · " + featured.level : ""}</p><h1 className="mt-1.5 max-w-xl font-display text-2xl font-semibold leading-tight sm:text-3xl">{featured.title}</h1><p className="mt-2 line-clamp-2 max-w-xl text-xs leading-5 text-white/75">{featured.description}</p><div className="mt-4 flex items-center justify-between gap-3"><span className="truncate text-xs font-medium text-white/85">By {featured.creatorDisplayName || "Xora Creator"}</span><span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-foreground">Explore course <ChevronRight className="size-3.5"/></span></div></div>
      </button>:null}
      <nav aria-label="Course categories" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{categories.map(item=><button key={item} onClick={()=>setCategory(item)} aria-pressed={category===item} className={"h-9 shrink-0 rounded-full border px-4 text-xs font-semibold transition active:scale-95 " + (category===item ? "border-foreground bg-foreground text-background shadow-sm" : "border-border bg-surface text-foreground hover:border-primary/40")}>{item}</button>)}</nav>
      <section><div className="mb-3"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-primary">{filtering?"Your results":"Discover"}</p><h2 className="mt-1 font-display text-xl font-semibold sm:text-2xl">{filtering?"Courses for your search":"Explore courses"}</h2><p className="mt-1 text-[11px] text-muted-foreground">{filtered.length} {filtered.length===1?"course":"courses"} from Xora creators</p></div>
        {isPending?<div className="grid grid-cols-2 gap-3"><div className="aspect-[4/5] animate-pulse rounded-2xl bg-muted"/><div className="aspect-[4/5] animate-pulse rounded-2xl bg-muted"/></div>:filtered.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">{filtered.map(card)}</div>:<div className="rounded-3xl border border-dashed border-border bg-surface px-6 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Search className="size-5"/></div><h3 className="mt-4 font-display text-lg font-semibold">No courses found</h3><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Try another search or category. Courses appear here when Xora creators publish them.</p><button onClick={()=>{setSearch("");setCategory("All courses");}} className="mt-4 rounded-xl border border-border px-4 py-2 text-xs font-semibold">Clear filters</button></div>}
      </section>
      {!filtering&&filtered.length>0?<section><h2 className="font-display text-xl font-semibold">New from creators</h2><p className="mt-1 text-[11px] text-muted-foreground">Recently published courses with real creator thumbnails.</p><div className="no-scrollbar -mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-2">{filtered.slice(0,6).map(course=><button key={course.id} onClick={()=>setActive(course)} className="w-[76%] max-w-[290px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm"><div className="aspect-video bg-secondary">{course.thumbnailUrl?<img src={course.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover"/>:<div className="grid size-full place-items-center bg-gradient-to-br from-primary/15 to-accent/20"><BookOpen className="size-7 text-primary/60"/></div>}</div><div className="p-3"><p className="line-clamp-1 text-sm font-bold">{course.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{course.creatorDisplayName||"Xora Creator"}</p><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-primary">View course <ChevronRight className="size-3"/></span></div></button>)}</div></section>:null}
      <div><FeedTabs active="learn"/><XoraInHouseAd placement="learn_feed" variant="banner" className="mb-4 mt-2"/><FeedList feed="learn"/></div>
    </div>
    {active?<div role="dialog" aria-modal="true" aria-label={active.title} className="fixed inset-0 z-[100] flex items-end justify-center md:items-center"><button aria-label="Close details" onClick={()=>setActive(null)} className="absolute inset-0 bg-foreground/55 backdrop-blur-sm"/><section className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl md:rounded-[28px]">
      <div className="relative aspect-video max-h-[240px] shrink-0 bg-secondary">{active.thumbnailUrl?<img src={active.thumbnailUrl} alt="" className="size-full object-cover"/>:<div className="grid size-full place-items-center bg-gradient-to-br from-primary/15 to-accent/20"><BookOpen className="size-10 text-primary/60"/></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"/><button onClick={()=>setActive(null)} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/20 bg-black/35 text-white"><X className="size-4"/></button><div className="absolute inset-x-0 bottom-0 p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/75">{active.category||"Xora creator course"}</p><h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{active.title}</h2></div></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"><div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"><span className="grid size-10 place-items-center rounded-full bg-primary/10 font-bold text-primary">{String(active.creatorDisplayName||"X").split(/\s+/).map(v=>v[0]).join("").slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{active.creatorDisplayName||"Xora Creator"}</p><p className="text-[11px] text-muted-foreground">{active.creatorUsername?"@"+active.creatorUsername:"X Channel creator"}{active.level?" · "+active.level:""}</p></div></div><div><h3 className="font-display text-lg font-semibold">About this course</h3><p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-muted-foreground">{active.description||"Course details will be provided by the creator."}</p></div>{owned.has(active.id)&&active.videoUrl?<div><h3 className="mb-2 font-display text-lg font-semibold">Start learning</h3><div className="overflow-hidden rounded-2xl bg-black"><video controls playsInline preload="metadata" poster={active.thumbnailUrl||undefined} className="aspect-video w-full" src={active.videoUrl}/></div></div>:<div className="rounded-2xl border border-primary/15 bg-primary/5 p-3.5"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary"/><div><p className="text-xs font-bold">Unlock with Xora Points</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Earn points through eligible CPA participation in Rewards. Course access never requires cash payment or a wallet debit.</p><p className="mt-2 text-sm font-bold text-primary">{requiredPoints(active,pointValue).toLocaleString()} XP required · {balance.toLocaleString()} XP available</p></div></div></div>}</div>
      <div className="flex items-center gap-3 border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><div className="min-w-0 flex-1"><p className="font-display text-lg font-semibold">{requiredPoints(active,pointValue).toLocaleString()} XP</p><p className="text-[10px] text-muted-foreground">Earned through CPA participation</p></div>{owned.has(active.id)?<span className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600/10 px-4 text-xs font-bold text-emerald-700"><CheckCircle2 className="size-4"/>Unlocked</span>:<button disabled={busy===active.id||balance<requiredPoints(active,pointValue)} onClick={()=>void unlock(active)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy===active.id?<Loader2 className="size-4 animate-spin"/>:<LockKeyhole className="size-4"/>}{busy===active.id?"Unlocking…":balance<requiredPoints(active,pointValue)?"Not enough points":"Unlock course"}</button>}</div>
    </section></div>:null}
  </AppShell>;
}
