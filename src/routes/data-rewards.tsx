import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock3, Gift, Loader2, RefreshCw, ShieldCheck, Smartphone, Wifi, XCircle } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/data-rewards")({ component: DataRewardsPage });

type RewardPlan = {
  catalogId: string;
  network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  dataSize: string;
  planName: string;
  validity: string;
};
type RewardClaim = {
  id: string;
  network: string;
  dataSize: string;
  phoneNumber: string;
  status: "processing" | "success" | "failed" | string;
  createdAt: string;
  completedAt?: string | null;
  reference?: string;
  message: string;
};

const NETWORKS = ["MTN", "GLO", "AIRTEL", "9MOBILE"] as const;
const networkStyle: Record<string, string> = {
  MTN: "bg-amber-400/15 text-amber-800",
  GLO: "bg-emerald-500/10 text-emerald-700",
  AIRTEL: "bg-rose-500/10 text-rose-700",
  "9MOBILE": "bg-green-500/10 text-green-800",
};
function statusLabel(status: string) {
  if (status === "success") return "Fulfilled";
  if (status === "failed") return "Not fulfilled";
  return "Processing";
}
function statusClass(status: string) {
  if (status === "success") return "bg-emerald-500/10 text-emerald-700";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

function DataRewardsPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>("MTN");
  const [selectedId, setSelectedId] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [claimKey, setClaimKey] = useState("");

  const rewards = useQuery({
    queryKey: ["data-rewards", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => commerceFetch<{ ok: true; plans: RewardPlan[]; claims: RewardClaim[] }>("/api/data-rewards"),
    refetchInterval: 15000,
  });

  const plans = useMemo(() => (rewards.data?.plans || []).filter((plan) => plan.network === network), [rewards.data, network]);
  const selected = plans.find((plan) => plan.catalogId === selectedId) || plans[0];
  const claims = rewards.data?.claims || [];
  const successfulClaims = claims.filter((claim) => claim.status === "success").length;

  async function submitClaim() {
    if (!user) { window.location.href = "/auth"; return; }
    if (!selected || phone.replace(/\D/g, "").length !== 11 || busy) return;
    const key = claimKey || (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `claim_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`);
    setClaimKey(key);
    setBusy(true);
    setNotice(null);
    try {
      const result = await commerceFetch<{ ok: true; claim: RewardClaim }>("/api/data-rewards/claim", {
        method: "POST",
        body: JSON.stringify({ catalogId: selected.catalogId, phoneNumber: phone, idempotencyKey: key }),
      });
      const status = result.claim.status;
      setNotice({
        type: status === "success" ? "success" : status === "failed" ? "error" : "info",
        text: status === "success"
          ? `${selected.dataSize} has been successfully sent to ${phone}.`
          : status === "failed"
            ? "MELE could not fulfil this reward. No successful claim was recorded. You can try again after checking the recipient number."
            : "Your request reached MELE and is being processed. Check the claim history for updates.",
      });
      setClaimKey(status === "failed" ? "" : "");
      await rewards.refetch();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not claim this data reward." });
      // Keep the same idempotency key so a retry cannot create a second provider purchase.
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <AppShell wide><div className="mx-auto max-w-xl rounded-[28px] border border-[#eadfd5] bg-[#fffdf9] p-8 text-center shadow-card">
      <Gift className="mx-auto size-10 text-[#65483c]" />
      <h1 className="mt-4 font-display text-2xl font-semibold text-[#5c4037]">Data Rewards</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to browse and claim available mobile data rewards.</p>
      <a href="/auth" className="mt-5 inline-flex rounded-xl bg-[#65483c] px-5 py-3 text-sm font-semibold text-white">Sign in</a>
    </div></AppShell>;
  }

  return <AppShell wide>
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[#d9c4b1] bg-gradient-to-br from-[#eee1d5] via-[#e7d8e9] to-[#d9c8e7] p-5 text-[#543b48] shadow-card sm:p-7">
        <div className="absolute -right-10 -top-14 size-48 rounded-full bg-white/25 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-3 py-1.5 text-[11px] font-semibold"><Gift className="size-3.5" /> Xora Rewards Centre</div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">A little data goes a long way.</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#654f60]">Choose an available bundle, enter the number that should receive it, and claim. Xora fulfils approved rewards through MELE.</p>
          </div>
          <div className="grid min-w-[132px] place-items-center rounded-2xl border border-white/60 bg-white/45 p-4 text-center backdrop-blur">
            <div className="grid size-10 place-items-center rounded-xl bg-white/70 text-[#65483c]"><Wifi className="size-5" /></div>
            <p className="mt-2 font-display text-2xl font-semibold">{successfulClaims}</p>
            <p className="text-[11px] text-[#654f60]">Successful claims</p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#654f60]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/45 px-3 py-2"><ShieldCheck className="size-3.5" /> No Xora Wallet deduction</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/45 px-3 py-2"><Smartphone className="size-3.5" /> Delivered to your number</span>
        </div>
      </section>

      {rewards.isError ? <div className="rounded-2xl border border-destructive/20 bg-background p-4 text-sm text-destructive">{rewards.error.message}</div> : null}
      {notice ? <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${notice.type === "error" ? "border-destructive/20 bg-destructive/5 text-destructive" : notice.type === "success" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-800" : "border-amber-500/20 bg-amber-500/5 text-amber-800"}`}>
        {notice.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : notice.type === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <Clock3 className="mt-0.5 size-4 shrink-0" />}
        <span>{notice.text}</span>
      </div> : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl border border-[#eadfd5] bg-[#fffdf9] p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-display text-xl font-semibold text-[#5c4037]">Choose your data reward</h2><p className="mt-1 text-xs text-muted-foreground">Only MELE plans published by Xora are shown.</p></div>
            <button type="button" onClick={() => void rewards.refetch()} disabled={rewards.isFetching} aria-label="Refresh rewards" className="rounded-xl border border-[#eadfd5] p-2 text-[#65483c] disabled:opacity-50">{rewards.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</button>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{NETWORKS.map((item) => <button key={item} type="button" onClick={() => { setNetwork(item); setSelectedId(""); }} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${network === item ? "bg-[#65483c] text-white" : "border border-[#eadfd5] bg-white text-[#65483c]"}`}>{item}</button>)}</div>
          {rewards.isPending ? <div className="grid min-h-36 place-items-center text-sm text-muted-foreground"><Loader2 className="mb-2 size-5 animate-spin" />Loading available rewards…</div> :
            plans.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{plans.map((plan) => <button key={plan.catalogId} type="button" onClick={() => setSelectedId(plan.catalogId)} className={`rounded-2xl border p-4 text-left transition ${selected?.catalogId === plan.catalogId ? "border-[#8b6b8e] bg-[#f5edf5] shadow-sm" : "border-[#eadfd5] bg-white hover:bg-[#faf5f8]"}`}>
              <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${networkStyle[plan.network] || "bg-muted text-foreground"}`}>{plan.network}</span>{selected?.catalogId === plan.catalogId ? <CheckCircle2 className="size-4 text-[#76517a]" /> : null}</div>
              <p className="mt-3 font-display text-2xl font-semibold text-[#5c4037]">{plan.dataSize}</p>
              <p className="mt-1 text-xs text-muted-foreground">{plan.planName}{plan.validity ? ` · ${plan.validity}` : ""}</p>
              <p className="mt-3 text-xs font-semibold text-[#76517a]">Claim reward <ArrowRight className="ml-1 inline size-3.5" /></p>
            </button>)}</div> :
            <div className="mt-4 rounded-2xl border border-dashed border-[#eadfd5] p-8 text-center"><Gift className="mx-auto size-8 text-[#b69da9]" /><p className="mt-3 text-sm font-semibold text-[#5c4037]">No {network} rewards available yet</p><p className="mt-1 text-xs text-muted-foreground">More bundles will appear when they are published in Xora's data catalogue.</p></div>}
        </div>

        <aside className="h-fit rounded-3xl border border-[#eadfd5] bg-[#f8f1f6] p-5 shadow-sm">
          <div className="grid size-10 place-items-center rounded-xl bg-white text-[#76517a]"><Smartphone className="size-5" /></div>
          <h2 className="mt-3 font-display text-xl font-semibold text-[#5c4037]">Where should we send it?</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Double-check the recipient number before claiming. A successful provider delivery may not be reversible.</p>
          <label className="mt-5 block text-xs font-semibold text-[#65483c]">Recipient phone number</label>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="08012345678" className="mt-1.5 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#b69ab8]" />
          {selected ? <div className="mt-4 rounded-2xl border border-white bg-white/75 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b6b8e]">Your selection</p>
            <div className="mt-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#5c4037]">{selected.network} · {selected.dataSize}</span><span className="text-xs text-emerald-700">Free reward</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{selected.planName}{selected.validity ? ` · ${selected.validity}` : ""}</p>
          </div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d9c4d8] p-4 text-center text-xs text-muted-foreground">Select a bundle to continue.</div>}
          <button type="button" onClick={() => void submitClaim()} disabled={busy || !selected || phone.replace(/\D/g, "").length !== 11} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#65483c] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4e352d] disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}{busy ? "Sending claim to MELE…" : "Claim data reward"}
          </button>
          <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">MELE provider balance must be sufficient. Your Xora Wallet is not charged.</p>
        </aside>
      </section>

      <section className="rounded-3xl border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold text-[#5c4037]">Your claim activity</h2><p className="mt-1 text-xs text-muted-foreground">Track provider fulfilment and previous rewards.</p></div><span className="text-[10px] text-muted-foreground">Auto-refreshes</span></div>
        {rewards.isPending ? <div className="py-8 text-center text-xs text-muted-foreground">Loading claim history…</div> :
          claims.length ? <div className="mt-3 divide-y divide-[#efe5dc]">{claims.map((claim) => <article key={claim.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1e7ef] text-[#76517a]"><Wifi className="size-5" /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#5c4037]">{claim.network} · {claim.dataSize}</p><p className="mt-1 text-[11px] text-muted-foreground">{claim.phoneNumber} · {claim.createdAt ? new Date(claim.createdAt).toLocaleString() : "Date unavailable"}</p><p className="mt-1 text-[11px] text-muted-foreground">{claim.message}</p></div>
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${statusClass(claim.status)}`}>{statusLabel(claim.status)}</span>
          </article>)}</div> :
          <div className="mt-4 rounded-2xl border border-dashed border-[#eadfd5] p-8 text-center"><Gift className="mx-auto size-8 text-[#b69da9]" /><p className="mt-3 text-sm font-semibold text-[#5c4037]">Your first reward is waiting</p><p className="mt-1 text-xs text-muted-foreground">Once you claim a bundle, its delivery status will appear here.</p></div>}
      </section>
    </main>
  </AppShell>;
}
