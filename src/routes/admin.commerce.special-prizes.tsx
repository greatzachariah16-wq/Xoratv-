import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce/special-prizes")({ component: SpecialPrizesAdmin });
type Prize = { id: string; title: string; description: string; campaignId: string; status: "active" | "paused"; clicks: number; createdAt: string; updatedAt: string };
const empty = { id: "", title: "", description: "", campaignId: "", status: "active" as "active" | "paused" };
function SpecialPrizesAdmin() {
  const [prizes,setPrizes]=useState<Prize[]>([]);
  const [draft,setDraft]=useState(empty);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  async function load(){setLoading(true);try{const r=await commerceFetch<{prizes:Prize[]}>("/api/admin/commerce/special-prizes");setPrizes(r.prizes||[]);}catch(e){setMessage(e instanceof Error?e.message:"Could not load prizes.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function edit(p:Prize){setDraft({id:p.id,title:p.title,description:p.description,campaignId:p.campaignId,status:p.status});setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{await commerceFetch("/api/admin/commerce/special-prizes",{method:"POST",body:JSON.stringify(draft)});setDraft(empty);setMessage("Saved. The public Special Prizes page now uses the updated settings.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not save prize.");}finally{setBusy(false);}}
  async function toggle(p:Prize){setBusy(true);setMessage("");try{await commerceFetch("/api/admin/commerce/special-prizes/status",{method:"POST",body:JSON.stringify({id:p.id,status:p.status==="active"?"paused":"active"})});setMessage(p.status==="active"?"Prize paused; it will no longer appear to users.":"Prize reactivated; it is visible again.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not change status.");}finally{setBusy(false);}}
  return <AdminProtectedLayout title="Special Prizes" subtitle="Manage Golden Goose campaigns without releasing a new XoraTV app version." currentSectionId="commerce-special-prizes">
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Live catalogue</p><h1 className="mt-1 font-display text-2xl font-semibold">{draft.id?"Edit special prize":"Add special prize"}</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Paste the campaign ID from Golden Goose. XoraTV builds the provider script URL automatically; you can pause any offer immediately without updating the APK.</p></div>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-xs font-semibold">Prize title<input required minLength={2} maxLength={100} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="e.g. NaijaLucky — Glo Nigeria"/></label>
          <label className="block text-xs font-semibold">Short description<textarea maxLength={500} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="Eligibility and what users should expect"/></label>
          <label className="block text-xs font-semibold">Golden Goose campaign ID<input required value={draft.campaignId} onChange={e=>setDraft({...draft,campaignId:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm font-normal" placeholder="Campaign ID from the campaign tool"/></label>
          <div className="rounded-xl border border-border/70 bg-background p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Generated provider script</p><code className="mt-1 block break-all text-xs">https://ngglznw.com/bc/{draft.campaignId || "{campaign_id}"}.js?force_https=1</code></div>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={draft.status==="active"} onChange={e=>setDraft({...draft,status:e.target.checked?"active":"paused"})}/> Publish this prize immediately</label>
          <div className="flex flex-wrap gap-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}{busy?"Saving…":"Save prize"}</button>{draft.id?<button type="button" onClick={()=>setDraft(empty)} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold">Cancel edit</button>:null}</div>
        </form>
      </section>
      {message?<p className="rounded-xl border border-border bg-muted/20 p-3 text-sm">{message}</p>:null}
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Saved prizes ({prizes.length})</h2><button type="button" onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold"><RefreshCw className={loading?"size-3.5 animate-spin":"size-3.5"}/>Refresh</button></div>
        {loading&&!prizes.length?<p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Loading catalogue…</p>:null}
        {prizes.map(p=><article key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{p.title}</h3><span className={p.status==="active"?"rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600":"rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground"}>{p.status}</span></div><p className="mt-1 break-all text-[11px] text-muted-foreground">Campaign: {p.campaignId} · Opens: {p.clicks}</p><p className="mt-1 text-xs text-muted-foreground">{p.description}</p></div><button disabled={busy} type="button" onClick={()=>void toggle(p)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">{p.status==="active"?<ToggleRight className="size-4"/>:<ToggleLeft className="size-4"/>}{p.status==="active"?"Pause":"Activate"}</button><button disabled={busy} type="button" onClick={()=>edit(p)} className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">Edit</button></article>)}
      </section>
    </div>
  </AdminProtectedLayout>;
}
