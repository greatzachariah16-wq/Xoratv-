import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, BarChart3, BookOpen, ChevronRight, CircleDollarSign, Copy, Gift, Landmark, Link2, Loader2, Megaphone, Plus, ShieldCheck, Smartphone, Trash2, Wallet } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";

export const Route = createFileRoute("/creator-studio")({ component: CreatorStudio });

function CreatorStudio() {
  const { user, profile } = useAuth();
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const { data, isPending, refetch } = useQuery(creatorDashboardQuery(user?.id));

  if (!user) {
    return (
      <AppShell wide>
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-border bg-surface shadow-card">
          <div className="relative overflow-hidden border-b border-border px-6 py-12 sm:px-10 sm:py-14">
            <div className="absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary"><ShieldCheck className="size-3.5" /> Xora Creator Studio</div>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Build something people can come back to.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">Creator Studio gives you a dedicated workspace for courses, promotions, earnings and creator payouts.</p>
              <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card">Sign in to continue <ArrowUpRight className="size-4" /></Link>
            </div>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-3">
            {[["Publish","Turn your knowledge into courses."],["Promote","Share Xora products with your audience."],["Earn","Track sales, commissions and payouts."]].map(([title,text]) => <div key={title} className="bg-surface p-5"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>)}
          </div>
        </div>
      </AppShell>
    );
  }


  const dashboard = data?.dashboard;
  const creator = dashboard?.creator;

  async function register() {
    setBusy(true);
    try {
      await commerceFetch("/api/commerce/creator/register", { method: "POST", body: JSON.stringify({ userId: user.id, displayName: profile?.display_name || user.displayName || "Xora Creator", username: profile?.username || user.email?.split("@")[0] || user.id.slice(0, 8) }) });
      setRegistered(true); await refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Creator registration failed."); } finally { setBusy(false); }
  }

  async function deleteCourse(courseId: string, title: string) {
    if (!window.confirm(`Delete "${title}" from your Creator Studio? It will no longer be available for sale.`)) return;
    setDeleteBusy(courseId);
    try {
      await commerceFetch("/api/commerce/creator/course", {
        method: "DELETE",
        body: JSON.stringify({ creatorId: user.id, courseId }),
      });
      await refetch();
      alert("Course deleted.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete course.");
    } finally {
      setDeleteBusy(null);
    }
  }

  async function savePayout() {
    setPayoutBusy(true);
    try {
      await commerceFetch("/api/commerce/creator/payout", { method: "POST", body: JSON.stringify({ userId: user.id, accountName, accountNumber, bankName }) });
      alert("Payout details saved."); await refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Could not save payout details."); } finally { setPayoutBusy(false); }
  }

  async function createOfferPromotion() {
    setLinkBusy("offer");
    try {
      await commerceFetch("/api/offers/creator-link", { method: "POST", body: JSON.stringify({ creatorId: user.id }) });
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create Offer Wall promotion link.");
    } finally {
      setLinkBusy(null);
    }
  }

  async function createPromotion(service: "data" | "course", courseId?: string) {
    const key = service === "course" ? "course:" + courseId : "data";
    setLinkBusy(key);
    try {
      await commerceFetch("/api/commerce/creator/promotion-link", {
        method: "POST",
        body: JSON.stringify({ creatorId: user.id, service, courseId }),
      });
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create promotion link.");
    } finally {
      setLinkBusy(null);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard?.writeText(window.location.origin + value);
    alert("Promotion link copied.");
  }

  if (!creator && !registered) {
    return (
      <AppShell wide>
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-[34px] border border-border bg-surface shadow-card">
            <div className="absolute inset-x-0 top-0 h-1 bg-primary" /><div className="absolute -right-24 -top-24 size-80 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.15fr_.85fr] lg:p-11">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold text-primary"><BarChart3 className="size-3.5" /> Creator Studio</div>
                <h1 className="mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">A proper workspace for your creator business.</h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text  return (
    <AppShell wide>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <header className="relative overflow-hidden rounded-[32px] border border-border bg-surface shadow-card">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" /><div className="absolute -right-28 -top-28 size-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Creator Studio</span><span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"><Activity className="size-3" /> Workspace active</span></div>
                <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Good to see you, {creator?.displayName || profile?.display_name || "Creator"}.</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage your creator business, publish content and turn your audience into measurable sales.</p>
              </div>
              <div className="shrink-0 rounded-2xl border border-primary/15 bg-primary/8 px-5 py-4 sm:min-w-[190px]"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Available balance</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">₦{Number(dashboard?.stats?.balance || 0).toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">Ready for creator payout</p></div>
            </div>
            <div className="mt-7 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-3">{[["Courses",dashboard?.courses?.length||0,"Published products"],["Sales",dashboard?.stats?.totalSales||0,"Tracked revenue"],["CPA",dashboard?.cpa?.approvedConversions||0,"Approved conversions"]].map(([label,value,sub])=><div key={String(label)} className="flex items-center justify-between rounded-2xl bg-background/60 px-4 py-3 sm:block"><div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{String(label)}</p><p className="mt-1 text-lg font-semibold tabular-nums">{label==="Courses"||label==="CPA"?Number(value).toLocaleString():"₦"+Number(value).toLocaleString()}</p></div><p className="text-[11px] text-muted-foreground sm:mt-0.5">{String(sub)}</p></div>)}</div>
          </div>
        </header>
        <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[[BarChart3,"Total sales",dashboard?.stats?.totalSales||0,"Revenue"],[Smartphone,"Data sales",dashboard?.stats?.dataSales||0,"Xora Data"],[Wallet,"Commission",dashboard?.stats?.commission||0,"Creator earnings"],[BookOpen,"Courses",dashboard?.courses?.length||0,"In your studio"]].map(([Icon,label,value,sub])=><div key={String(label)} className="group rounded-[22px] border border-border bg-surface p-4 transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4.5" /></div><ArrowUpRight className="size-4 text-muted-foreground/60" /></div><p className="mt-4 text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 text-xl font-semibold tabular-nums">{label==="Courses"?Number(value).toLocaleString():"₦"+Number(value).toLocaleString()}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{String(sub)}</p></div>)}
        </section>
        <section className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Megaphone className="size-5 text-primary" /><h2 className="font-display text-xl font-semibold">Promotion center</h2></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Create trackable links for Xora Data, courses and the Offer Wall, then share them with your audience.</p></div><span className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">Creator tools</span></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4"><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Gift className="size-4" /></div><span className="text-[11px] font-semibold text-primary">35% CPA share</span></div><p className="mt-4 text-sm font-semibold">Xora Offers</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Promote eligible Offer Wall offers and earn 35% of CPAGrip's payout on approved referred conversions.</p><button onClick={() => void createOfferPromotion()} disabled={Boolean(linkBusy)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{linkBusy==="offer"?"Generating…":"Generate offer link"}<ArrowUpRight className="size-3.5" /></button></div>
            <button onClick={() => void createPromotion("data")} disabled={Boolean(linkBusy)} className="rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:bg-secondary disabled:opacity-50"><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Smartphone className="size-4" /></div><Link2 className="size-4 text-muted-foreground" /></div><p className="mt-4 text-sm font-semibold">Xora Data</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Create a unique share link to the Xora data marketplace.</p><span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">{linkBusy==="data"?"Generating…":"Generate data link"}<ChevronRight className="size-3.5" /></span></button>
            <div className="rounded-2xl border border-border bg-background p-4"><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-4" /></div><span className="text-[11px] text-muted-foreground">Per course</span></div><p className="mt-4 text-sm font-semibold">Course promotions</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Generate a dedicated share link for each course you publish.</p><div className="mt-3 space-y-2">{(dashboard?.courses||[]).map((course:any)=>{const key="course:"+course.id;return <button key={course.id} onClick={()=>void createPromotion("course",course.id)} disabled={Boolean(linkBusy)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-left text-xs hover:bg-secondary disabled:opacity-50"><span className="truncate font-semibold">{course.title}</span><span className="shrink-0 text-primary">{linkBusy===key?"Generating…":"Generate"}</span></button>})}{!(dashboard?.courses||[]).length?<p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Publish a course first.</p>:null}</div></div>
          </div>
          <div className="mt-4 space-y-2">{(dashboard?.links||[]).map((link:any)=><div key={link.token} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background p-3.5"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"><Link2 className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{link.label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{window.location.origin+link.path}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{link.service==="data"?"Data promotion":link.service==="offer"?"Offer Wall promotion":"Course promotion"} · {Number(link.clicks||0).toLocaleString()} clicks</p></div><button onClick={()=>void copy(link.path)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"><Copy className="size-3.5" /> Copy</button></div>)}{!(dashboard?.links||[]).length?<p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No promotion links yet. Generate one above to start sharing.</p>:null}</div>
        </section>
        <section className="rounded-[28px] border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Gift className="size-5 text-primary" /><h2 className="font-display text-xl font-semibold">Offer Wall commissions</h2></div><p className="mt-1 text-sm leading-6 text-muted-foreground">Separate from data and course sales. Creator commissions are based on approved referred conversions and settle with Xora's CPAGrip revenue.</p></div><span className="hidden rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary sm:inline-flex">CPA</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Approved conversions</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Number(dashboard?.cpa?.approvedConversions||0).toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">Minimum {Number(dashboard?.cpa?.minConversions||200).toLocaleString()} to qualify</p></div><div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Pending commission</p><p className="mt-1 text-2xl font-semibold tabular-nums">$ {Number(dashboard?.cpa?.pendingCommission||0).toFixed(2)}</p><p className="mt-1 text-[11px] text-muted-foreground">Awaiting settlement</p></div><div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Payable commission</p><p className="mt-1 text-2xl font-semibold tabular-nums">$ {Number(dashboard?.cpa?.payableCommission||0).toFixed(2)}</p><p className="mt-1 text-[11px] text-muted-foreground">{dashboard?.cpa?.payoutEligible?"Eligible for payout":"Waiting for threshold and settlement"}</p></div></div>
        </section>
        <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[28px] border border-border bg-surface p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BookOpen className="size-5 text-primary" /><h2 className="font-display text-xl font-semibold">Your courses</h2></div><p className="mt-1 text-sm text-muted-foreground">Manage the learning products you publish through Xora.</p></div><Link to="/learn" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5" /> Open Learn</Link></div><div className="mt-5 space-y-2.5">{(dashboard?.courses||[]).map((c:any)=><div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{c.status} · ₦{Number(c.price||0).toLocaleString()}</p></div><button type="button" onClick={()=>void deleteCourse(c.id,c.title)} disabled={deleteBusy===c.id} className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><Trash2 className="size-3.5" />{deleteBusy===c.id?"Deleting…":"Delete"}</button></div>)}{!(dashboard?.courses||[]).length?<div className="rounded-2xl border border-dashed border-border p-7 text-center"><BookOpen className="mx-auto size-7 text-muted-foreground/60" /><p className="mt-2 text-sm font-semibold">No courses yet</p><p className="mt-1 text-xs text-muted-foreground">Open Learn when you're ready to publish your first course.</p></div>:null}</div></div>
          <div className="rounded-[28px] border border-border bg-surface p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Landmark className="size-5" /></div><div><h2 className="font-display text-xl font-semibold">Payout profile</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Bank transfer details for creator payouts.</p></div></div><div className="mt-5 space-y-3"><input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Account name" className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary" /><input value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} inputMode="numeric" placeholder="Account number" className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary" /><input value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Bank name" className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary" /><button onClick={()=>void savePayout()} disabled={payoutBusy||!accountName||!accountNumber||!bankName} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{payoutBusy?<Loader2 className="size-4 animate-spin" />:<Landmark className="size-4" />}Save payout details</button></div></div>
        </section>
      </div>
    </AppShell>
  );

}
