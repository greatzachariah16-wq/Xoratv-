import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone, Check, Loader2, ArrowRight, RefreshCw, Radio } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { melePlansQuery, commerceFetch, type MelePlan } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/data")({ component: BuyDataPage });

function BuyDataPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<MelePlan["network"]>("MTN");
  const [phone, setPhone] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isPending, error, refetch, isFetching } = useQuery(melePlansQuery(true));
  const ref = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
  const plans = useMemo(() => (data?.plans || []).filter((p) => p.network === network), [data, network]);
  const selected = plans.find((p) => p.plan_id === selectedId) || plans[0];

  async function beginOrder() {
    if (!user) { window.location.href = "/auth"; return; }
    if (!selected || phone.replace(/\D/g, "").length !== 11) return;
    setBusy(true);
    try {
      const result = await commerceFetch<{ok:true;order:any}>("/api/commerce/data/order", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, plan: selected, phoneNumber: phone.replace(/\D/g, ""), referralCode: ref }),
      });
      alert(`Order ${result.order.id} created. Payment integration is the next step before live customer charging.`);
    } catch (e) { alert(e instanceof Error ? e.message : "Could not create order."); }
    finally { setBusy(false); }
  }

  return <AppShell wide>
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-primary"><Smartphone className="size-5"/><span className="text-sm font-semibold">Xora Data</span><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600"><Radio className="size-3"/>Live MELE catalog</span></div><button type="button" onClick={()=>void refetch()} disabled={isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold">{isFetching?<Loader2 className="size-3 animate-spin"/>:<RefreshCw className="size-3"/>}{isFetching?"Refreshing…":"Refresh live plans"}</button></div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Buy data without the clutter.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose a live MELE DATA plan, enter the recipient number, and review your order.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {(["MTN","GLO","AIRTEL","9MOBILE"] as const).map(n => <button key={n} onClick={()=>{setNetwork(n);setSelectedId(null)}} className={`rounded-full px-4 py-2 text-sm font-semibold ${network===n?"bg-primary text-primary-foreground":"border border-border bg-background"}`}>{n}</button>)}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-border bg-background p-5">
          <h2 className="font-display text-lg font-semibold">Select a plan</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {isPending ? <div className="p-4 text-sm text-muted-foreground">Loading live plans…</div> : error ? <div className="p-4 text-sm text-destructive">Could not load plans. <button className="underline" onClick={()=>void refetch()}>Retry</button></div> : plans.map(p => <button key={p.plan_id} onClick={()=>setSelectedId(p.plan_id)} className={`rounded-2xl border p-4 text-left transition ${selected?.plan_id===p.plan_id?"border-primary bg-primary/5 shadow-card":"border-border bg-surface hover:bg-secondary"}`}><div className="flex items-center justify-between"><span className="font-semibold">{p.data_size}</span>{selected?.plan_id===p.plan_id?<Check className="size-4 text-primary"/>:null}</div><div className="mt-1 text-xs text-muted-foreground">{p.plan_name} · {p.validity}</div><div className="mt-3 text-lg font-semibold">₦{p.price.toLocaleString()}</div></button>)}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Recipient & order</h2>
          <label className="mt-4 block text-xs font-medium text-muted-foreground">Phone number</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="08012345678" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"/>
          {selected ? <div className="mt-4 rounded-2xl border border-border bg-background p-4"><div className="flex justify-between text-sm"><span>{selected.network} {selected.data_size}</span><span className="font-semibold">₦{selected.price.toLocaleString()}</span></div><div className="mt-1 text-xs text-muted-foreground">{selected.validity}</div></div>:null}
          <button disabled={busy || !selected || phone.replace(/\D/g,"").length!==11} onClick={()=>void beginOrder()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:<ArrowRight className="size-4"/>}{busy?"Creating order…":"Continue"}</button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Plans are fetched from your server-side MELE DATA account at page load. Xora does not hardcode carrier prices. A successful live refresh confirms that the configured MELE API key can authenticate and read the catalog; actual purchases are only sent after the customer payment flow is connected.</p>
        </div>
      </section>
    </div>
  </AppShell>;
}
