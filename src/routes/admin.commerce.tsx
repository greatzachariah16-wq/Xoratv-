import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, BookOpen, Smartphone, Wallet, ShieldCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { adminCommerceQuery, commerceFetch, melePlansQuery, type MelePlan } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce")({ component: AdminCommerce });

function AdminCommerce() {
  const { data, isPending, error } = useQuery(adminCommerceQuery());
  const { data: planData } = useQuery(melePlansQuery(true));
  const [network, setNetwork] = useState<MelePlan["network"]>("MTN");
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const o = data?.overview;
  const plans = useMemo(() => (planData?.plans || []).filter((p) => p.network === network), [planData, network]);

  async function runTest() {
    if (!planId || phone.replace(/\D/g, "").length !== 11) return;
    if (!window.confirm("This is a LIVE MELE purchase test. It can debit the Xora MELE wallet and send real data to the number entered. Continue?")) return;
    setTesting(true); setResult(null);
    try {
      const r = await commerceFetch<any>("/api/admin/commerce/mele-test-purchase", {
        method: "POST",
        body: JSON.stringify({ network, planId: Number(planId), phoneNumber: phone }),
      });
      setResult(`Success: ${r.test.response?.message || "MELE accepted the purchase"} · ref ${r.test.reference}`);
    } catch (e) {
      setResult(e instanceof Error ? `Failed: ${e.message}` : "MELE purchase test failed.");
    } finally { setTesting(false); }
  }

  if (isPending) return <AppShell wide><div className="p-8 text-sm text-muted-foreground">Loading commerce monitor…</div></AppShell>;
  if (error) return <AppShell wide><div className="p-8 text-sm text-destructive">Could not load commerce monitor.</div></AppShell>;

  return <AppShell wide><div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin</p><h1 className="mt-2 font-display text-3xl font-semibold">Commerce monitor</h1><p className="mt-1 text-sm text-muted-foreground">Creators, courses, data orders, commissions and payout records from the live Firebase-backed commerce layer.</p></header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[Users,"Creators",o?.creators?.length||0],[BookOpen,"Courses",o?.courses?.length||0],[Smartphone,"Data orders",o?.dataOrders?.length||0],[Wallet,"Commissions",o?.commissions?.length||0]].map(([I,l,v])=><div className="rounded-2xl border border-border bg-surface p-4" key={String(l)}><I className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v}</p></div>)}</div>

    <section className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-amber-600"/><div><h2 className="font-display text-xl font-semibold">Live MELE purchase test</h2><p className="mt-1 text-sm text-muted-foreground">Use this only when you intentionally want to make a real purchase. It uses the server-side MELE API key and can debit the live wallet.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={network} onChange={(e)=>{setNetwork(e.target.value as MelePlan["network"]);setPlanId("")}} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"><option>MTN</option><option>GLO</option><option>AIRTEL</option><option>9MOBILE</option></select>
        <select value={planId} onChange={(e)=>setPlanId(e.target.value)} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"><option value="">Select live plan</option>{plans.map((p)=><option key={p.plan_id} value={p.plan_id}>{p.data_size} · ₦{p.price.toLocaleString()} · {p.validity}</option>)}</select>
        <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="08012345678" className="rounded-xl border border-input bg-background px-3 py-3 text-sm"/>
      </div>
      <button type="button" disabled={testing||!planId||phone.replace(/\D/g,"").length!==11} onClick={()=>void runTest()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{testing?<Loader2 className="size-4 animate-spin"/>:null}{testing?"Sending live test…":"Run live purchase test"}</button>
      {result?<p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">{result}</p>:null}
    </section>

    <section className="rounded-3xl border border-border bg-surface p-5"><h2 className="font-display text-xl font-semibold">Commerce records</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Course orders</p><p className="mt-1 text-xl font-semibold">{o?.courseOrders?.length||0}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Payout profiles</p><p className="mt-1 text-xl font-semibold">{o?.payoutDetails?.length||0}</p></div></div><h2 className="mt-6 font-display text-xl font-semibold">Creators</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="pb-3">Creator</th><th className="pb-3">Status</th><th className="pb-3">Created</th></tr></thead><tbody>{(o?.creators||[]).map((c:any)=><tr key={c.id} className="border-b border-border/60"><td className="py-3">{c.displayName} <span className="text-muted-foreground">@{c.username}</span></td><td>{c.status}</td><td>{new Date(c.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>
  </div></AppShell>;
}
