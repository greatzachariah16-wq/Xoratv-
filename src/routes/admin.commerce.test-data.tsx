import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, LockKeyhole } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { melePlansQuery, vtusharePlansQuery, meleHealthQuery, vtushareHealthQuery, type MelePlan, type VtusharePlan } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce/test-data")({ component: TestData });

function TestData() {
  const mele = useQuery(melePlansQuery(true)), vt = useQuery(vtusharePlansQuery(true)), mh = useQuery(meleHealthQuery()), vh = useQuery(vtushareHealthQuery());
  const [provider, setProvider] = useState<"mele" | "vtushare">("mele");
  const [network, setNetwork] = useState("MTN"); const [planId, setPlanId] = useState(""); const [bundleId, setBundleId] = useState(""); const [networkId, setNetworkId] = useState(""); const [typeId, setTypeId] = useState(""); const [result, setResult] = useState<string | null>(null);
  const melePlans = useMemo(() => ((mele.data?.plans || []) as MelePlan[]).filter(p => p.network === network), [mele.data, network]);
  const vtPlans = (vt.data?.plans || []) as VtusharePlan[];

  function run() {
    setResult("Live test purchases are temporarily locked. No provider wallet can be charged from this page.");
  }

  return <AdminProtectedLayout title="Test Data" subtitle="Safe provider test workspace — live purchases are currently locked." currentSectionId="commerce-test-data">
    <div className="mx-auto max-w-3xl space-y-4">
      <header><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Commerce</p><h1 className="mt-1 font-display text-2xl font-semibold">Test Data</h1><p className="mt-1 text-xs text-muted-foreground">This page is intentionally isolated because a test purchase may spend real provider wallet balance.</p></header>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-amber-600" />Live purchase warning</div><p className="mt-1 text-muted-foreground">Live purchases are currently locked. This page will be enabled only after the provider purchase flow is fully finished and verified.</p></div>
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
        <div className="flex gap-1 rounded-xl border border-border bg-muted/20 p-1 w-fit"><button type="button" onClick={() => setProvider("mele")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${provider === "mele" ? "bg-primary text-primary-foreground" : ""}`}>MELE</button><button type="button" onClick={() => setProvider("vtushare")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${provider === "vtushare" ? "bg-primary text-primary-foreground" : ""}`}>VTUshare</button></div>
        {provider === "mele" ? <><div className="grid gap-3 sm:grid-cols-2"><select value={network} onChange={e => { setNetwork(e.target.value); setPlanId(""); }} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">{["MTN","GLO","AIRTEL","9MOBILE"].map(n => <option key={n}>{n}</option>)}</select><select value={planId} onChange={e => setPlanId(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Select MELE plan</option>{melePlans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.data_size} · ₦{p.price} · {p.validity}</option>)}</select></div><p className="text-[10px] text-muted-foreground">MELE: {mh.data?.health?.connected ? "connected" : "not connected"} · {melePlans.length} plans for {network}</p></> : <><div className="grid gap-3 sm:grid-cols-3"><select value={bundleId} onChange={e => { const p = vtPlans.find(x => String(x.bundleId) === e.target.value); setBundleId(e.target.value); if (p) { setNetworkId(String(p.networkId)); setTypeId(String(p.typeId)); } }} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Select VTUshare bundle</option>{vtPlans.map(p => <option key={`${p.bundleId}-${p.networkId}-${p.typeId}`} value={p.bundleId}>{p.network} · {p.dataSize} · ₦{p.amount}</option>)}</select><input value={networkId} readOnly placeholder="Network ID" className="h-10 rounded-xl border border-input bg-muted px-3 text-sm" /><input value={typeId} readOnly placeholder="Type ID" className="h-10 rounded-xl border border-input bg-muted px-3 text-sm" /></div><p className="text-[10px] text-muted-foreground">VTUshare: {vh.data?.health?.connected ? "connected" : "not connected"} · {vtPlans.length} live plans</p></>}
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">Recipient number and live purchase execution are disabled for now.</div>
        <button type="button" onClick={run} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/20 px-3.5 text-xs font-semibold"><LockKeyhole className="size-3.5" />Test purchase locked</button>
        {result ? <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">{result}</div> : null}
      </div>
    </div>
  </AdminProtectedLayout>;
}