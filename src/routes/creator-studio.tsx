import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, Copy, Link2, Plus, Wallet, Landmark, Smartphone, Loader2 } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";

export const Route = createFileRoute("/creator-studio")({ component: CreatorStudio });

function CreatorStudio() {
  const { user, profile } = useAuth();
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const { data, isPending, refetch } = useQuery(creatorDashboardQuery(user?.id));

  if (!user) return <AppShell><div className="rounded-3xl border border-border bg-surface p-8 text-center"><h1 className="font-display text-2xl font-semibold">Creator Studio</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to register as a creator and manage your earnings.</p><Link to="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</Link></div></AppShell>;

  const dashboard = data?.dashboard;
  const creator = dashboard?.creator;

  async function register() {
    setBusy(true);
    try {
      await commerceFetch("/api/commerce/creator/register", { method: "POST", body: JSON.stringify({ userId: user.id, displayName: profile?.display_name || user.displayName || "Xora Creator", username: profile?.username || user.email?.split("@")[0] || user.id.slice(0, 8) }) });
      setRegistered(true); await refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Creator registration failed."); } finally { setBusy(false); }
  }

  async function savePayout() {
    setPayoutBusy(true);
    try {
      await commerceFetch("/api/commerce/creator/payout", { method: "POST", body: JSON.stringify({ userId: user.id, accountName, accountNumber, bankName }) });
      alert("Payout details saved."); await refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Could not save payout details."); } finally { setPayoutBusy(false); }
  }

  async function copy(value: string) {
    await navigator.clipboard?.writeText(window.location.origin + value);
    alert("Creator link copied.");
  }

  if (!creator && !registered) return <AppShell wide><div className="mx-auto max-w-2xl rounded-[30px] border border-border bg-surface p-7 shadow-card"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-6"/></div><h1 className="mt-5 font-display text-3xl font-semibold">Creator Studio</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Turn your knowledge and audience into income. Register once so Xora can identify your creator account, sales, commissions and payout profile.</p><button onClick={() => void register()} disabled={busy} className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Setting up…" : "Become a creator"}</button></div></AppShell>;

  if (isPending) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading your studio…</div></AppShell>;

  return <AppShell wide>
    <div className="space-y-6">
      <header className="rounded-[30px] border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Creator Studio</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Your audience. Your storefront.</h1><p className="mt-2 text-sm text-muted-foreground">Manage courses, Xora data promotions, commissions and payouts from one place.</p></div><div className="rounded-2xl bg-primary/10 px-4 py-3 text-right"><p className="text-xs text-muted-foreground">Available balance</p><p className="text-2xl font-semibold">₦{Number(dashboard?.stats?.balance || 0).toLocaleString()}</p></div></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[[BarChart3,"Total sales",dashboard?.stats?.totalSales||0],[Smartphone,"Data sales",dashboard?.stats?.dataSales||0],[Wallet,"Commission",dashboard?.stats?.commission||0],[BookOpen,"Courses",dashboard?.courses?.length||0]].map(([Icon,label,value])=><div key={String(label)} className="rounded-2xl border border-border bg-surface p-4"><Icon className="size-5 text-primary"/><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{label === "Courses" ? value : "₦" + Number(value).toLocaleString()}</p></div>)}
      </section>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Promotional links</h2><p className="mt-1 text-sm text-muted-foreground">Each service gets its own creator referral link.</p></div><Link2 className="size-5 text-primary"/></div>
        <div className="mt-4 space-y-3">{(dashboard?.links||[]).map((link:any)=><div key={link.code} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{link.label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{window.location.origin + link.path}</p></div><button onClick={()=>void copy(link.path)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"><Copy className="size-3.5"/> Copy</button></div>)}</div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-5"><div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Your courses</h2><p className="mt-1 text-sm text-muted-foreground">Set your own course price when you publish.</p></div><Link to="/learn" className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/> Open Learn</Link></div><div className="mt-4 space-y-3">{(dashboard?.courses||[]).map((c:any)=><div key={c.id} className="rounded-2xl border border-border p-4"><div className="flex justify-between gap-3"><span className="font-semibold">{c.title}</span><span className="font-semibold">₦{Number(c.price||0).toLocaleString()}</span></div><p className="mt-1 text-xs text-muted-foreground">{c.status}</p></div>)}{!(dashboard?.courses||[]).length?<p className="text-sm text-muted-foreground">No courses yet.</p>:null}</div></div>
        <div className="rounded-3xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Landmark className="size-5 text-primary"/><h2 className="font-display text-xl font-semibold">Payout details</h2></div><p className="mt-1 text-sm text-muted-foreground">Bank transfer is supported. No bank list is hardcoded; enter the supported bank name when you are ready.</p><div className="mt-4 space-y-3"><input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Account name" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm"/><input value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} inputMode="numeric" placeholder="Account number" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm"/><input value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Bank name" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm"/><button onClick={()=>void savePayout()} disabled={payoutBusy || !accountName || !accountNumber || !bankName} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{payoutBusy?<Loader2 className="size-4 animate-spin"/>:<Landmark className="size-4"/>}Save payout details</button></div></div>
      </section>
    </div>
  </AppShell>;
}
