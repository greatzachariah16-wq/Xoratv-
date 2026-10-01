import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, Copy, Link2, Plus, Wallet, Landmark, Smartphone, Loader2, Trash2, Gift, X, AlertTriangle, Menu } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";

export const Route = createFileRoute("/creator-studio")({ component: CreatorStudio });

function CreatorStudio() {
  const { user, profile } = useAuth();
  const [registered, setRegistered] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [studioSection, setStudioSection] = useState<"overview" | "courses" | "promotions" | "payouts" | "commissions">("overview");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const { data, isPending, refetch } = useQuery(creatorDashboardQuery(user?.id));

  useEffect(() => {
    const name = (profile?.display_name || user?.displayName || "").trim();
    if (name && !accountName) setAccountName(name);
  }, [profile?.display_name, user?.displayName]);

  if (!user) return <AppShell><div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-border bg-surface p-8 text-center shadow-card sm:p-10"><h1 className="font-display text-2xl font-semibold">Creator Studio</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to register as a creator and manage your earnings.</p><Link to="/auth" className="mt-6 inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card">Sign in</Link></div></AppShell>;

  const dashboard = data?.dashboard;
  const creator = dashboard?.creator;

  async function register() {
    setBusy(true);
    try {
      await commerceFetch("/api/commerce/creator/register", { method: "POST", body: JSON.stringify({ userId: user.id, displayName: profile?.display_name || user.displayName || "Xora Creator", username: profile?.username || user.email?.split("@")[0] || user.id.slice(0, 8) }) });
      setRegistered(true); await refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Creator registration failed."); } finally { setBusy(false); }
  }

  function openDeleteCourse(courseId: string, title: string) {
    setDeleteError(null);
    setDeleteTarget({ id: courseId, title });
  }

  async function confirmDeleteCourse() {
    if (!deleteTarget) return;
    setDeleteBusy(deleteTarget.id);
    setDeleteError(null);
    try {
      await commerceFetch("/api/commerce/creator/course", {
        method: "DELETE",
        body: JSON.stringify({ creatorId: user.id, courseId: deleteTarget.id }),
      });
      setDeleteTarget(null);
      await refetch();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete course.");
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

  if (!creator && !registered) return <AppShell wide>
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative overflow-hidden rounded-[34px] border border-border bg-surface p-6 shadow-card sm:p-8">
        <div className="absolute -right-20 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-6" /></div>
            <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground">Creator application</span>
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">XoraTV Creator Studio</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Turn your audience into a storefront.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">Create video courses, promote Xora services, track commissions and manage payouts from one dedicated creator workspace.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4"><p className="text-sm font-semibold">Create</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Publish paid video courses.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><p className="text-sm font-semibold">Promote</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Share your creator links.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><p className="text-sm font-semibold">Earn</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Track sales and commissions.</p></div>
          </div>
        </div>
      </section>
      <section className="rounded-[34px] border border-border bg-surface p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Application</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Apply for Creator Studio</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">This is separate from your normal XoraTV profile. Your creator activity will be tied to this signed-in account.</p>
        <div className="mt-6 space-y-3">
          <div className="flex gap-3 rounded-2xl border border-border bg-background p-4"><BookOpen className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Creator identity</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Your existing Xora profile identifies your creator account.</p></div></div>
          <div className="flex gap-3 rounded-2xl border border-border bg-background p-4"><Wallet className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Creator earnings</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Sales, commissions and payout details stay in Creator Studio.</p></div></div>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background p-4">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
          <span className="text-xs leading-5 text-muted-foreground">I agree to the <span className="font-semibold text-foreground">Creator Studio terms</span> and understand creator activity may be reviewed by XoraTV.</span>
        </label>
        <button onClick={() => void register()} disabled={busy || !termsAccepted} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-card disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}
          {busy ? "Submitting application…" : "Apply & open Creator Studio"}
        </button>
        <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">Creator limits and anti-bot controls can be added later without changing the normal profile.</p>
      </section>
    </div>
  </AppShell>;
  if (isPending) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading your studio…</div></AppShell>;

  return <AppShell wide>
    <div className="contents">
    <div className="min-w-0 space-y-4 pt-14 lg:pt-0">
      <header className="sticky top-[60px] z-40 rounded-2xl lg:top-2 border border-border bg-surface/95 p-3 shadow-card backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Creator Studio</p>
            <h1 className="mt-0.5 truncate font-display text-lg font-semibold leading-tight sm:text-xl">Good to see you, {creator?.displayName || profile?.display_name || "Creator"}</h1>
          </div>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Open Creator Studio menu" aria-expanded={menuOpen} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold shadow-sm hover:bg-secondary">
              <Menu className="size-4" /><span>Menu</span>
            </button>
            {menuOpen ? <div className="absolute right-0 top-12 z-[60] w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-2xl">
              <Link to="/learn?create=1" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-secondary"><Plus className="size-4 text-primary" /> Create course</Link>
              <button type="button" onClick={() => { setStudioSection("courses"); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-secondary"><BookOpen className="size-4 text-primary" /> My courses</button>
              <button type="button" onClick={() => { setStudioSection("promotions"); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-secondary"><Link2 className="size-4 text-primary" /> Promotions</button>
              <button type="button" onClick={() => { setStudioSection("payouts"); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-secondary"><Landmark className="size-4 text-primary" /> Payment details</button>
              <button type="button" onClick={() => { setStudioSection("commissions"); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-secondary"><Gift className="size-4 text-primary" /> Commissions</button>
            </div> : null}
          </div>
        </div>
      </header>

      {studioSection !== "overview" ? <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <button type="button" onClick={() => setStudioSection("overview")} className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">← Back to studio overview</button>

        {studioSection === "courses" ? <div>
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Catalogue</p><h2 className="mt-1 font-display text-xl font-semibold">My Courses</h2></div><Link to="/learn?create=1" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground"><Plus className="size-3.5" /> Create course</Link></div>
          {(dashboard?.courses || []).length === 0 ? <div className="py-12 text-center"><BookOpen className="mx-auto size-7 text-primary" /><h3 className="mt-3 font-display text-base font-semibold">You have no courses available</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Please create a course to start building your creator catalogue.</p><Link to="/learn?create=1" className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"><Plus className="size-3.5" /> Create a course</Link></div> :
          <div className="mt-4 space-y-2">{(dashboard?.courses || []).map((course:any) => <div key={course.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{course.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{course.status} · ₦{Number(course.price || 0).toLocaleString()}</p></div><button type="button" onClick={() => openDeleteCourse(course.id, course.title)} className="shrink-0 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">Delete</button></div>)}</div>}
        </div> : null}

        {studioSection === "payouts" ? <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Payments</p><h2 className="mt-1 font-display text-xl font-semibold">Payment details</h2><p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">Add the bank account you want XoraTV to use for eligible creator payouts.</p>
          <div className="mt-5 max-w-xl space-y-4">
            <div><label className="text-xs font-semibold">Account name</label><input value={accountName} readOnly className="mt-1.5 h-10 w-full rounded-xl border border-border bg-secondary/60 px-3 text-sm" /><p className="mt-1.5 text-[11px] text-muted-foreground">This must match the name on your XoraTV profile.</p></div>
            <div><label className="text-xs font-semibold">Account number</label><input inputMode="numeric" maxLength={10} value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit account number" className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" /><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">Account name and account number should be accurate to avoid payment delay.</p></div>
            <div><label className="text-xs font-semibold">Bank</label><select value={bankName} onChange={e => setBankName(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Select your bank</option>{["Access Bank","ALAT by Wema","Citibank Nigeria","Ecobank Nigeria","FCMB","Fidelity Bank","First Bank of Nigeria","Globus Bank","GTBank","Jaiz Bank","Keystone Bank","Kuda","Moniepoint","OPay","PalmPay","Polaris Bank","PremiumTrust Bank","Providus Bank","Stanbic IBTC","Sterling Bank","UBA","Union Bank","Unity Bank","Wema Bank","Zenith Bank"].map(b => <option key={b}>{b}</option>)}</select></div>
            <button type="button" onClick={() => void savePayout()} disabled={payoutBusy || !accountName || accountNumber.replace(/\D/g,"").length !== 10 || !bankName} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{payoutBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Landmark className="size-3.5" />}{payoutBusy ? "Saving…" : "Save payment details"}</button>
          </div>
        </div> : null}

        {studioSection === "promotions" ? <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Promotion centre</p><h2 className="mt-1 font-display text-xl font-semibold">Promotions</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Generate a creator link for an available product and share it with your audience.</p>
          <div className="mt-5 space-y-2">
            {[{service:"data",label:"Xora Data Plans",courseId:undefined},{service:"course",label:"Published course",courseId:undefined}].slice(0,1).map(() => null)}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"><Link2 className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Xora Data Plans</p><p className="text-[11px] text-muted-foreground">Available data catalogue</p></div>{(() => { const l=(dashboard?.links||[]).find((x:any)=>x.service==="data"); return l ? <button type="button" onClick={() => void copy(l.path)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold">Copy link</button> : <button type="button" onClick={() => void createPromotion("data")} disabled={linkBusy==="data"} className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">{linkBusy==="data" ? "Generating…" : "Generate link"}</button>; })()}</div>
            {(dashboard?.courses || []).filter((x:any)=>x.status==="published").map((course:any) => { const l=(dashboard?.links||[]).find((x:any)=>x.service==="course"&&x.courseId===course.id); const key="course:"+course.id; return <div key={course.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"><Link2 className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{course.title}</p><p className="text-[11px] text-muted-foreground">Published course</p></div>{l ? <button type="button" onClick={() => void copy(l.path)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold">Copy link</button> : <button type="button" onClick={() => void createPromotion("course",course.id)} disabled={linkBusy===key} className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">{linkBusy===key ? "Generating…" : "Generate link"}</button>}</div>; })}
            {!(dashboard?.links||[]).length ? <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">You don't have any promotion links yet. Generate a link above to start promoting available products.</p> : null}
          </div>
        </div> : null}

        {studioSection === "commissions" ? <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Earnings</p><h2 className="mt-1 font-display text-xl font-semibold">Commissions</h2><div className="mt-5 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-muted-foreground">Commission</p><p className="mt-1 text-base font-semibold">₦{Number(dashboard?.stats?.commission||0).toLocaleString()}</p></div><div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-muted-foreground">Approved CPA</p><p className="mt-1 text-base font-semibold">{Number(dashboard?.cpa?.approvedConversions||0)}</p></div><div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-muted-foreground">Payout status</p><p className="mt-1 text-base font-semibold">{dashboard?.cpa?.payoutEligible ? "Eligible" : "Not yet eligible"}</p></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">CPA creator payouts require the configured minimum approved conversions and applicable settlement before payment.</p></div> : null}
      </section> : null}

      {studioSection === "overview" ? <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">Available balance</p><p className="mt-1 text-xl font-semibold">₦{Number(dashboard?.stats?.balance || 0).toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">Ready for eligible payout</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">Published courses</p><p className="mt-1 text-xl font-semibold">{Number(dashboard?.courses?.length || 0)}</p><p className="mt-1 text-[11px] text-muted-foreground">Your current catalogue</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">Course + data sales</p><p className="mt-1 text-xl font-semibold">₦{Number(dashboard?.stats?.totalSales || 0).toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">Recorded sales value</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">CPA progress</p><p className="mt-1 text-xl font-semibold">{Number(dashboard?.cpa?.approvedConversions || 0)} / {Number(dashboard?.cpa?.minConversions || 200)}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: Math.min(100, (Number(dashboard?.cpa?.approvedConversions || 0) / Math.max(1, Number(dashboard?.cpa?.minConversions || 200))) * 100) + "%" }} /></div></div>
      </section> : null}

      {studioSection === "overview" ? <section className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Creator progress</p><h2 className="mt-1 font-display text-lg font-semibold">Your studio at a glance</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Only live account activity is shown here. Detailed records stay inside the menu.</p></div><BarChart3 className="size-5 text-primary" /></div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-background">
            <div className="p-3"><p className="text-[10px] text-muted-foreground">Sales</p><p className="mt-1 text-base font-semibold">₦{Number(dashboard?.stats?.totalSales || 0).toLocaleString()}</p></div>
            <div className="p-3"><p className="text-[10px] text-muted-foreground">Commission</p><p className="mt-1 text-base font-semibold">₦{Number(dashboard?.stats?.commission || 0).toLocaleString()}</p></div>
            <div className="p-3"><p className="text-[10px] text-muted-foreground">Courses</p><p className="mt-1 text-base font-semibold">{Number(dashboard?.courses?.length || 0)}</p></div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Quick actions</p>
          <div className="mt-3 space-y-2">
            <Link to="/learn?create=1" className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold hover:bg-secondary"><span className="flex items-center gap-2"><Plus className="size-4 text-primary" /> Create course</span><span className="text-xs text-muted-foreground">Open</span></Link>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold hover:bg-secondary"><span className="flex items-center gap-2"><Landmark className="size-4 text-primary" /> Manage studio</span><span className="text-xs text-muted-foreground">Menu</span></button>
          </div>
        </div>
      </section> : null}

      {studioSection === "overview" ? <section id="courses" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Your courses</h2><p className="mt-1 text-xs text-muted-foreground">Manage published courses from one compact list.</p></div><Link to="/learn?create=1" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-secondary"><Plus className="size-3.5" /> Create</Link></div>
        <div className="mt-3 space-y-2">{(dashboard?.courses || []).map((c:any) => <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{c.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{c.status} · ₦{Number(c.price || 0).toLocaleString()}</p></div><button type="button" onClick={() => openDeleteCourse(c.id, c.title)} disabled={deleteBusy === c.id} className="shrink-0 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">{deleteBusy === c.id ? "Deleting…" : "Delete"}</button></div>)}{!(dashboard?.courses || []).length ? <p className="py-4 text-center text-xs text-muted-foreground">No courses yet.</p> : null}</div>
      </section> : null}
    </div>
      {deleteTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-course-title">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-3 px-4 py-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive">Delete course</p>
                  <h2 id="delete-course-title" className="mt-0.5 truncate font-display text-lg font-semibold">Delete “{deleteTarget.title}”?</h2>
                </div>
              </div>
              <button type="button" onClick={() => !deleteBusy && setDeleteTarget(null)} disabled={Boolean(deleteBusy)} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 pb-4">
              <p className="text-xs leading-5 text-muted-foreground">This permanently removes the course and clears its stored records.</p>
              <div className="rounded-xl border border-destructive/15 bg-destructive/5 px-3 py-2.5">
                <p className="text-xs font-semibold text-foreground">Also cleared</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Video media · content records · course promotion links</p>
              </div>
              {deleteError ? <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[11px] font-medium leading-5 text-destructive">{deleteError}</div> : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-background/40 px-4 py-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={Boolean(deleteBusy)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void confirmDeleteCourse()} disabled={Boolean(deleteBusy)} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50">
                {deleteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  </AppShell>;
}
