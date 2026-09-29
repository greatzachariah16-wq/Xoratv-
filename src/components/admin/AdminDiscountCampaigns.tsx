import { useState } from "react";
import { Ban, ExternalLink, Loader2, LockKeyhole, Pause, Play, Plus, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminDiscountCampaignsQuery, commerceFetch, type DiscountCampaign } from "@/lib/commerce";

export function AdminDiscountCampaigns() {
  const query = useQuery(adminDiscountCampaignsQuery());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", discountType: "percentage" as "percentage" | "fixed",
    discountValue: "", appliesTo: "both" as "data" | "course" | "both", maxRedemptions: "",
    cpaProvider: "", cpaOfferId: "", cpaContentLockUrl: "", cpaClickIdParameter: "subid",
  });

  async function createCampaign() {
    setBusy(true); setMessage(null);
    try {
      await commerceFetch("/api/admin/commerce/discount-campaigns", {
        method: "POST",
        body: JSON.stringify({ ...form, discountValue: Number(form.discountValue), maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null }),
      });
      setMessage("Discount campaign created as a draft. Activate it after checking the CPA offer.");
      setOpen(false);
      setForm({ name:"", description:"", discountType:"percentage", discountValue:"", appliesTo:"both", maxRedemptions:"", cpaProvider:"", cpaOfferId:"", cpaContentLockUrl:"", cpaClickIdParameter:"subid" });
      await query.refetch();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not create campaign."); }
    finally { setBusy(false); }
  }

  async function setStatus(campaign: DiscountCampaign, status: DiscountCampaign["status"]) {
    setBusy(true); setMessage(null);
    try {
      await commerceFetch("/api/admin/commerce/discount-campaigns/status", { method: "POST", body: JSON.stringify({ id: campaign.id, status }) });
      await query.refetch();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not update campaign."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Discount campaigns</p>
          <h2 className="mt-1 font-display text-xl font-semibold">CPA-gated discounts</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Create discounts for mobile data and courses. Every campaign requires a CPA offer before it can be activated.</p>
        </div>
        <button type="button" onClick={() => setOpen(v => !v)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          <Plus className="size-4" /> {open ? "Close" : "Create discount"}
        </button>
      </div>

      {message ? <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-3 text-sm">{message}</div> : null}

      {open ? (
        <div className="mt-5 rounded-2xl border border-border bg-muted/10 p-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <LockKeyhole className="mt-0.5 size-5 text-amber-600" />
            <div><p className="font-semibold">CPA content lock is required</p><p className="mt-1 text-xs text-muted-foreground">Use the exact offer details supplied by your CPA provider. Do not guess provider URLs or IDs.</p></div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Campaign name" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
            <input value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} placeholder="Short description (optional)" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
            <select value={form.discountType} onChange={e=>setForm(v=>({...v,discountType:e.target.value as "percentage"|"fixed"}))} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"><option value="percentage">Percentage discount</option><option value="fixed">Fixed ₦ discount</option></select>
            <input value={form.discountValue} onChange={e=>setForm(v=>({...v,discountValue:e.target.value}))} inputMode="decimal" placeholder={form.discountType === "percentage" ? "Discount % (e.g. 20)" : "Discount amount (e.g. 200)"} className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
            <select value={form.appliesTo} onChange={e=>setForm(v=>({...v,appliesTo:e.target.value as "data"|"course"|"both"}))} className="rounded-xl border border-input bg-background px-3 py-3 text-sm"><option value="both">Mobile data + courses</option><option value="data">Mobile data only</option><option value="course">Courses only</option></select>
            <input value={form.maxRedemptions} onChange={e=>setForm(v=>({...v,maxRedemptions:e.target.value}))} inputMode="numeric" placeholder="Maximum redemptions (optional)" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
          </div>

          <div className="mt-5"><p className="text-sm font-semibold">CPA offer configuration</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input value={form.cpaProvider} onChange={e=>setForm(v=>({...v,cpaProvider:e.target.value}))} placeholder="CPA provider" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <input value={form.cpaOfferId} onChange={e=>setForm(v=>({...v,cpaOfferId:e.target.value}))} placeholder="Offer ID" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <input value={form.cpaContentLockUrl} onChange={e=>setForm(v=>({...v,cpaContentLockUrl:e.target.value}))} placeholder="HTTPS content-lock URL" className="sm:col-span-2 rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <input value={form.cpaClickIdParameter} onChange={e=>setForm(v=>({...v,cpaClickIdParameter:e.target.value}))} placeholder="Click ID parameter (default: subid)" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
            </div>
          </div>

          <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !form.name || !form.discountValue || !form.cpaProvider || !form.cpaOfferId || !form.cpaContentLockUrl} onClick={() => void createCampaign()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />} Create campaign</button></div>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-border overflow-hidden">
        {query.isPending ? <div className="p-5 text-sm text-muted-foreground">Loading discount campaigns…</div> :
         query.error ? <div className="p-5 text-sm text-destructive">Could not load discount campaigns.</div> :
         (query.data?.campaigns || []).length === 0 ? <div className="p-5 text-sm text-muted-foreground">No discount campaigns yet.</div> :
         <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground"><tr className="border-b border-border"><th className="p-3">Campaign</th><th className="p-3">Discount</th><th className="p-3">Applies to</th><th className="p-3">CPA offer</th><th className="p-3">Redemptions</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
          <tbody>{(query.data?.campaigns || []).map(c => <tr key={c.id} className="border-b border-border/60 align-middle">
            <td className="p-3"><div className="font-semibold">{c.name}</div><div className="text-xs text-muted-foreground">{c.description || "No description"}</div></td>
            <td className="p-3 font-semibold">{c.discountType === "percentage" ? String(c.discountValue) + "%" : "₦" + c.discountValue.toLocaleString()}</td>
            <td className="p-3 capitalize">{c.appliesTo === "both" ? "Data + courses" : c.appliesTo}</td>
            <td className="p-3"><div className="font-medium">{c.cpa.provider}</div><div className="text-xs text-muted-foreground">{c.cpa.offerId}</div></td>
            <td className="p-3">{c.redemptions}{c.maxRedemptions ? " / " + c.maxRedemptions : ""}</td>
            <td className="p-3"><span className={c.status === "active" ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700"}>{c.status}</span></td>
            <td className="p-3"><div className="flex flex-wrap gap-2">
              {c.status === "draft" || c.status === "paused" ? <button type="button" disabled={busy} onClick={()=>void setStatus(c,"active")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground"><Play className="size-3.5"/> Activate</button> : null}
              {c.status === "active" ? <button type="button" disabled={busy} onClick={()=>void setStatus(c,"paused")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold"><Pause className="size-3.5"/> Pause</button> : null}
              {c.status !== "expired" ? <button type="button" disabled={busy} onClick={()=>void setStatus(c,"expired")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold"><Ban className="size-3.5"/> Expire</button> : null}
            </div></td>
          </tr>)}</tbody>
         </table></div>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-3 py-1.5">CPA-gated</span><span className="rounded-full border border-border px-3 py-1.5">Server-side postback</span><span className="rounded-full border border-border px-3 py-1.5">Duplicate-safe conversions</span>
        <span className="ml-auto inline-flex items-center gap-1"><ExternalLink className="size-3.5" /> Postback endpoint: <code>/api/webhooks/discount-cpa</code></span>
      </div>
    </section>
  );
}
