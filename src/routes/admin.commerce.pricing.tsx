import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, CircleCheck, CircleX } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { adminDataCatalogQuery, commerceFetch, meleHealthQuery, vtushareHealthQuery, type DataCatalogRecord } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce/pricing")({ component: Pricing });

function Pricing() {
  const query = useQuery(adminDataCatalogQuery(false));
  const mele = useQuery(meleHealthQuery());
  const vt = useQuery(vtushareHealthQuery());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mele" | "vtushare">("all");
  const records = (query.data?.catalog || []).filter((r: DataCatalogRecord) => filter === "all" || r.provider === filter);

  async function save(r: DataCatalogRecord) {
    setBusy(r.catalogId);
    try {
      await commerceFetch("/api/admin/commerce/data-catalog/price", { method: "POST", body: JSON.stringify({ catalogId: r.catalogId, customerPrice: Number(draft[r.catalogId] ?? r.customerPrice) }) });
      await query.refetch();
    } catch (e) { alert(e instanceof Error ? e.message : "Could not update price."); }
    finally { setBusy(null); }
  }

  return <AdminProtectedLayout title="Pricing" subtitle="Set the customer selling price for the live provider catalogue." currentSectionId="commerce-pricing">
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Commerce</p><h1 className="mt-1 font-display text-2xl font-semibold">Pricing</h1><p className="mt-1 text-xs text-muted-foreground">Provider costs stay separate from the Xora customer price you control here.</p></div><button type="button" onClick={() => void query.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold"><RefreshCw className="size-3.5" />Refresh</button></header>
      <div className="grid gap-2 sm:grid-cols-2"><Status name="MELE" connected={Boolean(mele.data?.health?.connected)} /><Status name="VTUshare" connected={Boolean(vt.data?.health?.connected)} /></div>
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">{(["all", "mele", "vtushare"] as const).map(x => <button key={x} type="button" onClick={() => setFilter(x)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{x === "all" ? "All" : x === "mele" ? "MELE" : "VTUshare"}</button>)}</div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-border bg-muted/30"><tr><th className="p-3">Provider</th><th className="p-3">Network</th><th className="p-3">Data</th><th className="p-3">Validity</th><th className="p-3">Provider cost</th><th className="p-3">Xora price</th><th className="p-3">Status</th></tr></thead><tbody>{records.map((r: DataCatalogRecord) => <tr key={r.catalogId} className="border-b border-border/60 last:border-0"><td className="p-3 font-semibold">{r.provider}</td><td className="p-3">{r.network}</td><td className="p-3">{r.data_size}</td><td className="p-3">{r.validity}</td><td className="p-3">₦{Number(r.providerCost).toLocaleString()}</td><td className="p-2"><div className="flex items-center gap-1"><input inputMode="decimal" value={draft[r.catalogId] ?? r.customerPrice} onChange={e => setDraft(v => ({ ...v, [r.catalogId]: e.target.value }))} className="h-8 w-24 rounded-lg border border-input bg-background px-2 text-xs" /><button type="button" onClick={() => void save(r)} disabled={busy === r.catalogId} className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"><Save className="size-3.5" /></button></div></td><td className="p-3">{r.status}</td></tr>)}</tbody></table></div>
    </div>
  </AdminProtectedLayout>;
}
function Status({ name, connected }: { name: string; connected: boolean }) { return <div className="rounded-xl border border-border bg-surface p-3">{connected ? <CircleCheck className="size-4 text-emerald-600" /> : <CircleX className="size-4 text-amber-600" />}<p className="mt-1 text-xs font-semibold">{name}</p><p className="text-[10px] text-muted-foreground">{connected ? "Connected" : "Needs configuration"}</p></div>; }