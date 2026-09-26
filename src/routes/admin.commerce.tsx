import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, BookOpen, Smartphone, Wallet, ShieldCheck, Loader2, RefreshCw, CircleCheck, CircleX, Webhook } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { adminCommerceQuery, commerceFetch, meleHealthQuery, melePlansQuery, vtushareHealthQuery, vtusharePlansQuery, type MelePlan, type VtusharePlan } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce")({ component: AdminCommerce });

function normalizeNetwork(value: unknown): MelePlan["network"] | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized === "MTN") return "MTN";
  if (normalized === "GLO") return "GLO";
  if (normalized === "AIRTEL") return "AIRTEL";
  if (normalized === "9MOBILE" || normalized === "9MOBIL") return "9MOBILE";
  return null;
}

function AdminCommerce() {
  const { data, isPending, error } = useQuery(adminCommerceQuery());
  const healthQuery = useQuery(meleHealthQuery());
  const planQuery = useQuery(melePlansQuery(true));
  const vtHealthQuery = useQuery(vtushareHealthQuery());
  const vtPlanQuery = useQuery(vtusharePlansQuery(true));
  const [vtNetworkId, setVtNetworkId] = useState("");
  const [vtBundleId, setVtBundleId] = useState("");
  const [vtTypeId, setVtTypeId] = useState("");
  const [vtPhone, setVtPhone] = useState("");
  const [vtTesting, setVtTesting] = useState(false);
  const [vtResult, setVtResult] = useState<string | null>(null);
  const [network, setNetwork] = useState<MelePlan["network"]>("MTN");
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const o = data?.overview;

  const allPlans = useMemo(() => {
    const raw = planQuery.data?.plans ?? [];
    return raw
      .map((p) => ({ ...p, plan_id: Number(p.plan_id), network: normalizeNetwork(p.network) }))
      .filter((p): p is MelePlan => Number.isFinite(p.plan_id) && Boolean(p.network));
  }, [planQuery.data]);

  const plans = useMemo(
    () => allPlans.filter((p) => p.network === network),
    [allPlans, network],
  );

  async function runTest() {
    if (!planId || phone.replace(/\D/g, "").length !== 11) return;
    if (!window.confirm("This is a LIVE MELE purchase test. It can debit the Xora MELE wallet and send real data to the number entered. Continue?")) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await commerceFetch<any>("/api/admin/commerce/mele-test-purchase", {
        method: "POST",
        body: JSON.stringify({ network, planId: Number(planId), phoneNumber: phone }),
      });
      setResult(`Success: ${r.test.response?.message || "MELE accepted the purchase"} · ref ${r.test.reference}`);
    } catch (e) {
      setResult(e instanceof Error ? `Failed: ${e.message}` : "MELE purchase test failed.");
    } finally {
      setTesting(false);
    }
  }

  if (isPending) return <AppShell wide><div className="p-8 text-sm text-muted-foreground">Loading commerce monitor…</div></AppShell>;
  if (error) return <AppShell wide><div className="p-8 text-sm text-destructive">Could not load commerce monitor.</div></AppShell>;

  return <AppShell wide><div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin</p><h1 className="mt-2 font-display text-3xl font-semibold">Commerce monitor</h1><p className="mt-1 text-sm text-muted-foreground">Creators, courses, data orders, commissions and payout records from the live Firebase-backed commerce layer.</p></header>

    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">MELE connection</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Live API health</h2>
          <p className="mt-1 text-sm text-muted-foreground">Checks your server-side MELE token, wallet access and live plan catalogue without exposing the secret.</p>
        </div>
        <button type="button" onClick={() => { void healthQuery.refetch(); void planQuery.refetch(); }} disabled={healthQuery.isFetching || planQuery.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={healthQuery.isFetching || planQuery.isFetching ? "size-4 animate-spin" : "size-4"} /> Refresh
        </button>
      </div>

      {healthQuery.isPending ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Checking MELE…</div>
      ) : healthQuery.error ? (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Health check request failed: {healthQuery.error instanceof Error ? healthQuery.error.message : "Unknown error"}</div>
      ) : healthQuery.data?.health.connected ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><CircleCheck className="size-5 text-emerald-600"/><p className="mt-2 text-xs text-muted-foreground">Connection</p><p className="font-semibold">Connected</p></div>
          <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Mode</p><p className="mt-1 font-semibold">{healthQuery.data.health.mode}</p></div>
          <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Wallet</p><p className="mt-1 font-semibold">{healthQuery.data.health.display || "₦" + Number(healthQuery.data.health.balance || 0).toLocaleString()}</p></div>
          <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Live plans</p><p className="mt-1 font-semibold">{healthQuery.data.health.plansCount}</p></div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><CircleX className="size-5 text-amber-600"/> MELE connection needs attention</div>
          <p className="mt-1 text-muted-foreground">{healthQuery.data?.health.error || "The server could not verify the MELE account."}</p>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2"><Webhook className="size-4 text-primary"/><p className="text-sm font-semibold">Webhook endpoint</p></div>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">https://xoratv-x.onrender.com/api/webhooks/mele</p>
        <p className="mt-2 text-xs text-muted-foreground">Set <code>MELE_WEBHOOK_SECRET</code> in Render and use the same secret in MELE if its webhook settings provide one. Xora will match incoming transaction references to Firebase-backed orders.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border bg-background px-3 py-1.5">Endpoint: online</span>
          <span className={healthQuery.data?.health.webhookConfigured ? "rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-emerald-700" : "rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-amber-700"}>Secret: {healthQuery.data?.health.webhookConfigured ? "configured" : "not configured"}</span>
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Second provider</p>
          <h2 className="mt-1 font-display text-xl font-semibold">VTUshare connection</h2>
          <p className="mt-1 text-sm text-muted-foreground">Server-side credentials only. Xora reads the live VTUshare catalogue; it does not hardcode plan IDs or prices.</p>
        </div>
        <button type="button" onClick={() => { void vtHealthQuery.refetch(); void vtPlanQuery.refetch(); }} disabled={vtHealthQuery.isFetching || vtPlanQuery.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={(vtHealthQuery.isFetching || vtPlanQuery.isFetching) ? "size-4 animate-spin" : "size-4"} /> Refresh
        </button>
      </div>
      <div className="mt-4">
        {vtHealthQuery.isPending ? <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Checking VTUshare…</p> :
          vtHealthQuery.data?.health.connected ? <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><CircleCheck className="size-5 text-emerald-600"/><p className="mt-2 text-xs text-muted-foreground">Connection</p><p className="font-semibold">Connected</p></div>
            <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Live catalogue</p><p className="mt-1 font-semibold">{vtHealthQuery.data.health.plansCount} plans</p></div>
            <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Live test</p><p className="mt-1 font-semibold">{vtHealthQuery.data.health.livePurchasesEnabled ? "Enabled" : "Disabled"}</p></div>
          </div> :
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><CircleX className="size-5 text-amber-600"/> VTUshare needs configuration</div><p className="mt-1 text-muted-foreground">{vtHealthQuery.data?.health.error || "Add the VTUshare account credentials in Render."}</p></div>}
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Webhook endpoint</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">https://xoratv-x.onrender.com/api/webhooks/vtushare</p>
        <p className="mt-2 text-xs text-muted-foreground">The endpoint records provider callbacks and matches their transaction reference. Keep the webhook secret server-side.</p>
      </div>
      <div className="mt-4 rounded-2xl border border-border p-4">
        <p className="text-sm font-semibold">Live catalogue inspection</p>
        <p className="mt-1 text-xs text-muted-foreground">These values come from VTUshare's current API response. No purchase is made by loading this list.</p>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b border-border"><th className="p-2">Network</th><th className="p-2">Data</th><th className="p-2">Price</th><th className="p-2">Bundle</th><th className="p-2">Type</th></tr></thead>
          <tbody>{(vtPlanQuery.data?.plans || []).slice(0, 50).map((p: VtusharePlan) => <tr key={`${p.networkId}-${p.bundleId}-${p.typeId}`} className="border-b border-border/60"><td className="p-2">{p.network}</td><td className="p-2">{p.dataSize}</td><td className="p-2">₦{p.amount.toLocaleString()}</td><td className="p-2">{p.bundleId}</td><td className="p-2">{p.typeId} {p.typeName ? `· ${p.typeName}` : ""}</td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-amber-600"/><div><p className="font-semibold">Controlled VTUshare purchase test</p><p className="mt-1 text-xs text-muted-foreground">Disabled by default. We will not debit the VTUshare wallet until the server flag is explicitly enabled.</p></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input value={vtNetworkId} onChange={e=>setVtNetworkId(e.target.value)} inputMode="numeric" placeholder="Network ID" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
          <input value={vtBundleId} onChange={e=>setVtBundleId(e.target.value)} inputMode="numeric" placeholder="Bundle ID" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
          <input value={vtTypeId} onChange={e=>setVtTypeId(e.target.value)} inputMode="numeric" placeholder="Type ID" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
          <input value={vtPhone} onChange={e=>setVtPhone(e.target.value)} inputMode="tel" placeholder="08012345678" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
        </div>
        <button type="button" disabled={vtTesting || !vtNetworkId || !vtBundleId || !vtTypeId || vtPhone.replace(/\D/g,"").length!==11} onClick={async()=>{ if(!window.confirm("This will make a REAL VTUshare purchase and debit the VTUshare wallet. Continue?")) return; setVtTesting(true); setVtResult(null); try { const r=await commerceFetch<any>("/api/admin/commerce/vtushare-test-purchase",{method:"POST",body:JSON.stringify({networkId:Number(vtNetworkId),bundleId:Number(vtBundleId),typeId:Number(vtTypeId),phoneNumber:vtPhone})}); setVtResult(`Success: ${r.test.response?.message || "VTUshare accepted the purchase"} · ref ${r.test.response?.ref || "returned"}`); } catch(e){ setVtResult(e instanceof Error ? `Failed: ${e.message}` : "VTUshare purchase test failed."); } finally { setVtTesting(false); } }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{vtTesting?<Loader2 className="size-4 animate-spin"/>:null}{vtTesting?"Sending live test…":"Run VTUshare live test"}</button>
        {vtResult ? <p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">{vtResult}</p> : null}
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[Users,"Creators",o?.creators?.length||0],[BookOpen,"Courses",o?.courses?.length||0],[Smartphone,"Data orders",o?.dataOrders?.length||0],[Wallet,"Commissions",o?.commissions?.length||0]].map(([I,l,v])=><div className="rounded-2xl border border-border bg-surface p-4" key={String(l)}><I className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v}</p></div>)}</div>

    <section className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-amber-600"/><div><h2 className="font-display text-xl font-semibold">Live MELE purchase test</h2><p className="mt-1 text-sm text-muted-foreground">Use this only when you intentionally want to make a real purchase. It uses the server-side MELE API key and can debit the live wallet.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={network} onChange={(e)=>{setNetwork(e.target.value as MelePlan["network"]);setPlanId("")}} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"><option value="MTN">MTN</option><option value="GLO">GLO</option><option value="AIRTEL">AIRTEL</option><option value="9MOBILE">9MOBILE</option></select>
        <select value={planId} onChange={(e)=>setPlanId(e.target.value)} disabled={planQuery.isPending || planQuery.isFetching || !plans.length} className="rounded-xl border border-input bg-background px-3 py-3 text-sm disabled:opacity-60">
          <option value="">{planQuery.isPending || planQuery.isFetching ? "Loading live plans…" : planQuery.error ? "Could not load plans" : plans.length ? "Select live plan" : "No plans for this network"}</option>
          {plans.map((p)=><option key={`${p.network}-${p.plan_id}`} value={p.plan_id}>{p.data_size} · ₦{p.price.toLocaleString()} · {p.validity}</option>)}
        </select>
        <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="08012345678" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
      </div>
      {planQuery.error ? <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">Plan catalogue error: {planQuery.error instanceof Error ? planQuery.error.message : "Unable to load plans."}</p> : null}
      {!planQuery.isPending && !planQuery.isFetching && !planQuery.error && !allPlans.length ? <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">MELE responded successfully, but Xora received no usable plan records. The next step is to inspect the provider response shape rather than changing the pricing system.</p> : null}
      <button type="button" disabled={testing||!planId||phone.replace(/\D/g,"").length!==11} onClick={()=>void runTest()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{testing?<Loader2 className="size-4 animate-spin"/>:null}{testing?"Sending live test…":"Run live purchase test"}</button>
      {result?<p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">{result}</p>:null}
    </section>

    <section className="rounded-3xl border border-border bg-surface p-5"><h2 className="font-display text-xl font-semibold">Commerce records</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Course orders</p><p className="mt-1 text-xl font-semibold">{o?.courseOrders?.length||0}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Payout profiles</p><p className="mt-1 text-xl font-semibold">{o?.payoutDetails?.length||0}</p></div></div><h2 className="mt-6 font-display text-xl font-semibold">Creators</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="pb-3">Creator</th><th className="pb-3">Status</th><th className="pb-3">Created</th></tr></thead><tbody>{(o?.creators||[]).map((c:any)=><tr key={c.id} className="border-b border-border/60"><td className="py-3">{c.displayName} <span className="text-muted-foreground">@{c.username}</span></td><td>{c.status}</td><td>{new Date(c.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>
  </div></AppShell>;
}
