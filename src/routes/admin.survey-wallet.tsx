import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock3, RefreshCw, Save, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";
import { useState } from "react";

export const Route = createFileRoute("/admin/survey-wallet")({ component: SurveyWalletAdmin });
async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "Admin request failed.");
  return body as T;
}
function SurveyWalletAdmin() {
  const client = useQueryClient();
  const configQuery = useQuery({ queryKey: ["admin", "survey-wallet-config"], queryFn: () => adminFetch<{ ok: true; config: any }>("/api/admin/survey-wallet/config") });
  const payoutsQuery = useQuery({ queryKey: ["admin", "survey-wallet-payouts"], queryFn: () => adminFetch<{ ok: true; payouts: any[] }>("/api/admin/survey-wallet/payouts") });
  const [reward, setReward] = useState("10");
  const [minimum, setMinimum] = useState("200");
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  if (configQuery.data && !loaded) {
    setReward(String(configQuery.data.config.rewardPerSurvey ?? 10));
    setMinimum(String(configQuery.data.config.minimumPayout ?? 200));
    setEnabled(configQuery.data.config.payoutsEnabled !== false);
    setLoaded(true);
  }
  const save = useMutation({
    mutationFn: () => adminFetch("/api/admin/survey-wallet/config", { method: "POST", body: JSON.stringify({ rewardPerSurvey: Number(reward), minimumPayout: Number(minimum), payoutsEnabled: enabled }) }),
    onSuccess: () => { toast.success("Survey reward settings saved."); void client.invalidateQueries({ queryKey: ["admin", "survey-wallet-config"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings."),
  });
  const review = useMutation({
    mutationFn: (input: { payoutId: string; decision: string; note?: string; paymentReference?: string }) => adminFetch("/api/admin/survey-wallet/payouts/review", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => { toast.success("Payout status updated."); void client.invalidateQueries({ queryKey: ["admin", "survey-wallet-payouts"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update payout."),
  });
  const payouts = payoutsQuery.data?.payouts || [];
  return <AppShell wide><main className="mx-auto w-full max-w-5xl space-y-5">
    <header className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7"><div className="flex items-center gap-3 text-primary"><ShieldCheck className="size-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">Admin · Rewards</span></div><h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">Survey wallet & payouts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Configure future CPX Research rewards and review payout requests. Survey crediting remains inactive until the verified CPX integration is connected.</p></header>
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card"><div className="flex items-center gap-3"><Wallet className="size-5 text-primary"/><h2 className="font-display text-xl font-semibold">Reward settings</h2></div>{configQuery.isError ? <p className="mt-3 text-sm text-destructive">{configQuery.error.message}</p> : null}<div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Reward per approved survey (₦)<input inputMode="decimal" value={reward} onChange={e=>setReward(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Minimum payout (₦)<input inputMode="decimal" value={minimum} onChange={e=>setMinimum(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"/></label></div><label className="mt-4 flex items-center justify-between rounded-xl border border-border p-3 text-sm"><span><b className="block">Allow payout requests</b><span className="text-xs text-muted-foreground">Turn off temporarily without losing existing requests.</span></span><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} className="size-5 accent-primary"/></label><button onClick={()=>save.mutate()} disabled={save.isPending || !reward.trim() || !minimum.trim()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4"/>{save.isPending?"Saving…":"Save settings"}</button></section>
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-3"><Banknote className="size-5 text-primary"/><h2 className="font-display text-xl font-semibold">Payout requests</h2></div><p className="mt-1 text-xs text-muted-foreground">Funds are reserved when a request is submitted and released if you reject it.</p></div><button onClick={()=>void payoutsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"><RefreshCw className="size-3.5"/>Refresh</button></div>
      {payoutsQuery.isPending ? <p className="py-8 text-center text-sm text-muted-foreground">Loading payout requests…</p> : payoutsQuery.isError ? <p className="mt-4 text-sm text-destructive">{payoutsQuery.error.message}</p> : payouts.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No payout requests yet.</div> : <div className="mt-4 space-y-3">{payouts.map((p:any)=><article key={p.id} className="rounded-xl border border-border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">₦{Number(p.amount).toLocaleString()} · {p.userId}</p><p className="mt-1 text-xs text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString() : ""}</p><p className="mt-1 text-xs">Status: <b>{p.status}</b></p>{p.payoutDetails ? <p className="mt-2 break-all text-xs text-muted-foreground">Payout details submitted: {JSON.stringify(p.payoutDetails)}</p> : <p className="mt-2 text-xs text-muted-foreground">Payout method: {p.payoutMethod || "manual transfer"} · No bank details attached to this request.</p>}</div><span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">{p.status}</span></div>
        {!["paid","rejected"].includes(p.status) ? <div className="mt-3 flex flex-wrap gap-2"><button disabled={review.isPending} onClick={()=>review.mutate({payoutId:p.id,decision:"under_review"})} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Clock3 className="mr-1 inline size-3.5"/>Review</button><button disabled={review.isPending} onClick={()=>review.mutate({payoutId:p.id,decision:"on_hold",note:"Payout temporarily on hold pending available funds."})} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Put on hold</button><button disabled={review.isPending} onClick={()=>{const ref=window.prompt("Enter transfer reference (optional):")||"";review.mutate({payoutId:p.id,decision:"paid",paymentReference:ref})}} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><CheckCircle2 className="size-3.5"/>Mark paid</button><button disabled={review.isPending} onClick={()=>{if(window.confirm("Reject this payout? The reserved balance will be returned to the user."))review.mutate({payoutId:p.id,decision:"rejected",note:"Rejected by administrator; reserved balance released."})}} className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive">Reject</button></div> : null}
      </article>)}</div>}
    </section>
  </main></AppShell>;
}
