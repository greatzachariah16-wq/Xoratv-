import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { commerceFetch, coursesMarketQuery } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/learn")({ component: Learn });

function Learn() {
  const { user, profile } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("500");
  const [busy, setBusy] = useState(false);
  const { data, refetch } = useQuery(coursesMarketQuery());
  const ref = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;

  async function createCourse() {
    if (!user) { window.location.href = "/auth"; return; }
    setBusy(true);
    try {
      const reg = await commerceFetch<any>("/api/commerce/creator/register", { method:"POST", body:JSON.stringify({userId:user.id,displayName:profile?.display_name||user.displayName||"Creator",username:profile?.username||user.email?.split("@")[0]||user.id.slice(0,8)}) });
      await commerceFetch("/api/commerce/creator/course", { method:"POST", body:JSON.stringify({creatorId:reg.creator.id,title,description,price:Number(price)}) });
      setShowCreate(false); setTitle(""); setDescription(""); setPrice("500"); await refetch();
      alert("Course published.");
    } catch(e) { alert(e instanceof Error?e.message:"Could not publish course."); } finally { setBusy(false); }
  }

  return <AppShell rail={<TrendingRail/>} wide>
    <div className="space-y-6">
      <header className="rounded-[30px] border border-border bg-surface p-6 shadow-card"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><Sparkles className="size-5"/><span className="text-sm font-semibold">Xora Learn</span></div><h1 className="mt-2 font-display text-3xl font-semibold">Learn something useful.</h1><p className="mt-1 text-sm text-muted-foreground">Courses from Xora creators, with the original Learn feed still available below.</p></div>{user?<button onClick={()=>setShowCreate(v=>!v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="size-4"/> Sell a course</button>:null}</div></header>
      {showCreate?<section className="rounded-3xl border border-border bg-surface p-5"><h2 className="font-display text-xl font-semibold">Create a course</h2><p className="mt-1 text-sm text-muted-foreground">You choose the selling price. Xora stores the course in the live commerce database.</p><div className="mt-4 grid gap-3"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Course title" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What will students learn?" rows={4} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/><input value={price} onChange={e=>setPrice(e.target.value)} type="number" min="0" placeholder="Price in NGN" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/><button onClick={()=>void createCourse()} disabled={busy||!title||!description} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Publishing…":"Publish course"}</button></div></section>:null}
      <section><div className="mb-3 flex items-center gap-2"><BookOpen className="size-5 text-primary"/><h2 className="font-display text-xl font-semibold">Courses marketplace</h2></div><div className="grid gap-4 sm:grid-cols-2">{(data?.courses||[]).map((c:any)=><article key={c.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card"><div className="aspect-[16/9] bg-secondary">{c.thumbnailUrl?<img src={c.thumbnailUrl} alt="" className="size-full object-cover"/>:null}</div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Course</p><h3 className="mt-2 font-display text-xl font-semibold">{c.title}</h3><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.description}</p><div className="mt-4 flex items-center justify-between"><span className="text-lg font-semibold">₦{Number(c.price||0).toLocaleString()}</span><button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={async ()=>{ if(!user){window.location.href="/auth";return;} try{ const r=await commerceFetch<any>("/api/commerce/course/order",{method:"POST",body:JSON.stringify({userId:user.id,courseId:c.id,referralCode:ref})}); alert("Order "+r.order.id+" created. Checkout activates when Xora payment processing is connected."); }catch(e){alert(e instanceof Error?e.message:"Could not create order.");}}}>Buy course</button></div></div></article>)}{!(data?.courses||[]).length?<div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No courses have been published yet.</div>:null}</div></section>
      <div><FeedTabs active="learn"/><XoraInHouseAd placement="learn_feed" variant="banner" className="mb-4 mt-2"/><FeedList feed="learn"/></div>
    </div>
  </AppShell>;
}