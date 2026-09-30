import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone, Check, Loader2, ArrowRight, RefreshCw, Radio } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { dataPlansQuery, commerceFetch, xoraPointsQuery, type PublicDataPlan } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/data")({ component: BuyDataPage });

function BuyDataPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<PublicDataPlan["network"]>("MTN");
  const [phone, setPhone] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isPending, error, refetch, isFetching } = useQuery(dataPlansQuery(true));
  const pointsQuery = useQuery(xoraPointsQuery(user?.id));
  const [usePoints, setUsePoints] = useState(false);
  const ref = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("promo") || new URLSearchParams(window.location.search).get("ref")) : null;
  const plans = useMemo(() => (data?.plans || []).filter((p) => p.network === network), [data, network]);
  const selected = plans.find((p) => p.catalogId === selectedId) || plans[0];

  async function beginOrder() {
    if (!user) { window.location.href = "/auth"; return; }
    if (!selected || phone.replace(/\D/g, "").length !== 11) return;
    setBusy(true);
    try {
      const result = await commerceFetch<{ok:true;order:any}>("/api/commerce/data/order", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, catalogId: selected.catalogId, phoneNumber: phone.replace(/\D/g, ""), referralCode: ref, usePoints }),
      });
      const discount = Number(result.order?.pointsDiscount || 0);
      const finalPrice = Number(result.order?.finalPrice ?? selected.price);
      alert(`${discount > 0 ? `You used ${Number(result.order?.pointsRedeemed || 0).toLocaleString()} Xora Points and saved ₦${discount.toLocaleString()}. ` : ""}₦${finalPrice.toLocaleString()} was debited from your Xora Wallet. Your data order is now awaiting provider fulfilment.`);
      await pointsQuery.refetch();
    } catch (e) { const message = e instanceof Error ? e.message : "Could not create order."; if (/insufficient wallet balance/i.test(message)) { window.location.href = `/wallet?returnTo=/data&catalogId=${encodeURIComponent(selected.catalogId)}&phone=${encodeURIComponent(phone)}`; return; } alert(message); }
    finally { setBusy(false); }
  }

  return <AppShell wide>
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-border bg-surface p-4 shadow-card sm:rounded-[28px] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-primary"><Smartphone className="size-5"/><span className="text-sm font-semibold">Xora Data</span><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600"><Radio className="size-3"/>Live data plans</span></div><button type="button" onClick={()=>void refetch()} disabled={isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold">{isFetching?<Loader2 className="size-3 animate-spin"/>:<RefreshCw className="size-3"/>}{isFetching?"Refreshing…":"Refresh live plans"}</button></div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Buy data without the clutter.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose a live data plan, enter the recipient number, and pay directly from your Xora Wallet.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {(["MTN","GLO","AIRTEL","9MOBILE"] as const).map(n => <button key={n} onClick={()=>{setNetwork(n);setSelectedId(null)}} className={`rounded-full px-4 py-2 text-sm font-semibold ${network===n?"bg-primary text-primary-foreground":"border border-border bg-background"}`}>{n}</button>)}
        </div>
      </section>
      <section className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-border bg-background p-5">
          <h2 className="font-display text-lg font-semibold">Select a plan</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {isPending ? <div className="p-4 text-sm text-muted-foreground">Loading live plans…</div> : error ? <div className="p-4 text-sm text-destructive">Could not load plans. <button className="underline" onClick={()=>void refetch()}>Retry</button></div> : plans.map(p => <button key={p.catalogId} onClick={()=>setSelectedId(p.catalogId)} className={`rounded-2xl border p-4 text-left transition ${selected?.catalogId===p.catalogId?"border-primary bg-primary/5 shadow-card":"border-border bg-surface hover:bg-secondary"}`}><div className="flex items-center justify-between"><span className="font-semibold">{p.data_size}</span>{selected?.catalogId===p.catalogId?<Check className="size-4 text-primary"/>:null}</div><div className="mt-1 text-xs text-muted-foreground">{p.plan_name} · {p.validity}</div><div className="mt-3 text-lg font-semibold">₦{p.price.toLocaleString()}</div></button>)}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Recipient & order</h2>
          <label className="mt-4 block text-xs font-medium text-muted-foreground">Phone number</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="08012345678" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"/>
          {selected ? <div className="mt-4 rounded-2xl border border-border bg-background p-4"><div className="flex justify-between text-sm"><span>{selected.network} {selected.data_size}</span><span className="font-semibold">₦{selected.price.toLocaleString()}</span></div><div className="mt-1 text-xs text-muted-foreground">{selected.validity}</div></div>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div><p className="text-sm font-semibold">Use Xora Points</p><p className="mt-1 text-xs text-muted-foreground">Balance: {Number(pointsQuery.data?.wallet?.points || 0).toLocaleString()} XP · Up to {pointsQuery.data?.wallet?.maxDataDiscountPercent || 50}% off this data plan.</p></div>
            <input type="checkbox" checked={usePoints} onChange={(e)=>setUsePoints(e.target.checked)} className="size-5 accent-primary" />
          </label>:null}
          <button disabled={busy || !selected || phone.replace(/\D/g,"").length!==11} onClick={()=>void beginOrder()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:<ArrowRight className="size-4"/>}{busy?"Creating order…":"Continue"}</button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Plans and prices are refreshed from Xora's live data catalogue. Prices are not hardcoded on this page. Your wallet is debited only on the server after the selected plan is validated. Data delivery remains subject to provider fulfilment.</p>
        </div>
      </section>
    </div>
  </AppShell>;
}
