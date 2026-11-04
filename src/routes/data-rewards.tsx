import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Database, Gift, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/data-rewards")({ component: DataRewards });

type Network = "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
type MelePlan = { plan_id: number; network: Network; plan_name: string; data_size: string; validity: string; price: number };
type RewardStatus = { status?: string; reference?: string; message?: string; rewardSize?: string; deliveredSize?: string; points?: number; providerStatus?: string };
type DataRewardSnapshot = { claim: RewardStatus | null; lastClaim: RewardStatus | null; cooldownUntil: string | null; cooldownRemainingMs: number; pending: boolean };

function DataRewards() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<MelePlan[]>([]);
  const [network, setNetwork] = useState<Network>("MTN");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [rewardStatus, setRewardStatus] = useState<DataRewardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshPlans() {
    setLoadingPlans(true); setError("");
    try {
      const result = await commerceFetch<{ ok: true; plans: MelePlan[] }>("/api/commerce/data-rewards/plans");
      setPlans(result.plans);
      setSelectedPlanId((current) => result.plans.some((plan) => plan.plan_id === current && plan.network === network) ? current : (result.plans.find((plan) => plan.network === network)?.plan_id ?? null));
    } catch (e) { setError(e instanceof Error ? e.message : "Live MELE plans could not be loaded."); }
    finally { setLoadingPlans(false); }
  }

  async function refreshStatus() {
    if (!user) return;
    try {
      const result = await commerceFetch<{ ok: true } & DataRewardSnapshot>("/api/commerce/data-rewards");
      setRewardStatus({ claim: result.claim, lastClaim: result.lastClaim, cooldownUntil: result.cooldownUntil, cooldownRemainingMs: result.cooldownRemainingMs, pending: result.pending });
    } catch (e) { setError(e instanceof Error ? e.message : "Your data reward status could not be loaded."); }
  }

  useEffect(() => {
    const promo = new URLSearchParams(window.location.search).get("promo");
    if (promo && /^[A-Za-z0-9_-]{10,40}$/.test(promo)) window.sessionStorage.setItem("xora_data_reward_referral", promo);
    if (user) { void refreshPlans(); void refreshStatus(); }
  }, [user?.id]);

  const networkPlans = useMemo(() => plans.filter((plan) => plan.network === network).sort((a, b) => a.price - b.price || a.data_size.localeCompare(b.data_size)), [plans, network]);
  const selectedPlan = networkPlans.find((plan) => plan.plan_id === selectedPlanId) || null;
  const validPhone = /^0[789][01]\d{8}$/.test(phone.replace(/\s+/g, ""));

  async function submitClaim() {
    if (!user || !selectedPlan || claiming) return;
    setClaiming(true); setError(""); setNotice("");
    try {
      const result = await commerceFetch<{ ok: true; claim: RewardStatus }>("/api/commerce/data-rewards/claim", {
        method: "POST",
        body: JSON.stringify({ planId: selectedPlan.plan_id, network, referralCode: new URLSearchParams(window.location.search).get("promo") || window.sessionStorage.getItem("xora_data_reward_referral") || "", phoneNumber: phone.replace(/\s+/g, "") }),
      });
      setNotice(result.claim.message || "Your data request has been submitted.");
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your data request could not be submitted.");
      await refreshStatus();
    } finally { setClaiming(false); }
  }

  async function checkPendingClaim() {
    const reference = rewardStatus?.claim?.reference;
    if (!reference || checkingStatus) return;
    setCheckingStatus(true); setError("");
    try {
      const result = await commerceFetch<{ ok: true; claim: RewardStatus }>(`/api/commerce/data-rewards/claim-status?reference=${encodeURIComponent(reference)}`);
      setRewardStatus((current) => current ? { ...current, claim: result.claim, pending: ["processing", "provider_pending"].includes(String(result.claim.status || "")) } : current);
      setNotice(result.claim.status === "success" ? "MELE confirmed delivery." : result.claim.providerStatus === "not_found" ? "MELE found no transaction for that reference. You can submit a new request." : result.claim.status === "failed" ? "MELE confirmed the purchase failed." : "MELE has not confirmed delivery yet. Your request remains on hold.");
      await refreshStatus();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not check the MELE transaction."); }
    finally { setCheckingStatus(false); }
  }

  if (!user) return <AppShell wide><main className="mx-auto max-w-md rounded-3xl border border-[#eadfd5] bg-[#fffdf9] p-7 text-center shadow-sm"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0e4d9] text-[#65483c]"><Database className="size-7" /></div><h1 className="mt-4 font-display text-2xl font-semibold">Data Rewards</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to view available data bundles.</p><Link to="/auth" className="mt-5 inline-flex rounded-xl bg-[#65483c] px-5 py-3 text-sm font-semibold text-white">Sign in</Link></main></AppShell>;

  return <AppShell wide><main className="mx-auto w-full max-w-2xl space-y-5 pb-8">
    <header className="flex items-center gap-3"><Link to="/offers" aria-label="Back to offers" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#eadfd5] bg-[#fffdf9] text-[#65483c]"><ArrowLeft className="size-4" /></Link><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8b6b5d]">XoraTV rewards</p><h1 className="font-display text-2xl font-semibold">Data Rewards</h1></div><button type="button" onClick={() => { void refreshPlans(); void refreshStatus(); }} disabled={loadingPlans} aria-label="Refresh live plans" className="grid size-10 place-items-center rounded-xl border border-[#eadfd5] bg-[#fffdf9] text-[#65483c] disabled:opacity-50"><RefreshCw className={`size-4 ${loadingPlans ? "animate-spin" : ""}`} /></button></header>
    <section className="rounded-[24px] border border-[#eadfd5] bg-[#fffdf9] p-4 shadow-sm"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-[#f0e4d9] text-[#65483c]"><Gift className="size-5" /></div><div><p className="text-sm font-semibold text-[#3d302b]">Points temporarily disabled</p><p className="mt-1 text-xs text-muted-foreground">Choose any available bundle. No Xora Points are required or deducted right now.</p></div></div></section>
    <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Choose your data plan</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">XoraTV fetches the current plans directly from MELE when this page loads or refreshes.</p></div><span className="rounded-full bg-[#f3e9df] px-3 py-1.5 text-[10px] font-semibold text-[#65483c]">Live plans</span></div>
      <label className="mt-4 block text-xs font-semibold text-foreground">Mobile network<select value={network} onChange={(e) => { const next=e.target.value as Network; setNetwork(next); setSelectedPlanId(plans.find((plan) => plan.network === next)?.plan_id ?? null); }} className="mt-2 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:border-[#8b6b5d]"><option value="MTN">MTN</option><option value="GLO">Glo</option><option value="AIRTEL">Airtel</option><option value="9MOBILE">9mobile</option></select></label>
      {loadingPlans ? <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#f7f0e9] p-6 text-sm text-[#65483c]"><RefreshCw className="size-4 animate-spin" /> Loading live data plans…</div> : networkPlans.length ? <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{networkPlans.map((plan) => { const active=selectedPlan?.plan_id===plan.plan_id; return <button key={plan.plan_id} type="button" onClick={() => setSelectedPlanId(plan.plan_id)} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#65483c] bg-[#f4ebe3] ring-1 ring-[#65483c]" : "border-[#eadfd5] bg-white hover:border-[#c8b3a4]"}`}><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Database className="size-4" /></div>{active ? <CheckCircle2 className="size-5 text-[#65483c]" /> : <span className="size-5 rounded-full border border-[#d8c8bc]" />}</div><p className="mt-3 font-display text-xl font-semibold text-[#3d302b]">{plan.data_size}</p><p className="mt-1 text-sm font-semibold text-[#65483c]">{plan.plan_name}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{plan.validity || "Validity not supplied"}</span><span className="text-sm font-bold text-[#3d302b]">₦{Number(plan.price).toLocaleString("en-NG")}</span></div><p className="mt-2 text-[10px] font-medium text-[#8b6b5d]">Points: temporarily disabled</p></button>; })}</div> : <div className="mt-4 rounded-xl border border-[#eadfd5] bg-white p-5 text-center text-sm text-muted-foreground">No plans are currently available for this network. Try another network or refresh.</div>}
    </section>
    <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Smartphone className="size-5" /></div><div><h2 className="text-base font-semibold">Recipient details</h2><p className="text-xs text-muted-foreground">Enter the Nigerian number that should receive the bundle.</p></div></div>
      <label className="mt-4 block text-xs font-semibold text-foreground">Recipient phone number<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 13))} inputMode="tel" autoComplete="tel" placeholder="08012345678" className="mt-2 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:border-[#8b6b5d]" /></label>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f7f0e9] p-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#65483c]" /><p className="text-[11px] leading-5 text-[#6e5a50]">One successful data request every 24 hours. Points are disabled, and no points balance is changed.</p></div>
      {rewardStatus?.pending ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Your previous request is awaiting MELE confirmation. Another request is paused to prevent duplicate purchases.</p><button type="button" onClick={() => void checkPendingClaim()} disabled={checkingStatus} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 font-semibold disabled:opacity-50"><RefreshCw className={`size-3 ${checkingStatus ? "animate-spin" : ""}`} />{checkingStatus ? "Checking MELE…" : "Check transaction status"}</button></div> : null}
      {rewardStatus?.cooldownRemainingMs ? <p className="mt-3 rounded-xl border border-[#eadfd5] bg-[#f7f0e9] p-3 text-xs text-[#65483c]">Your next request is available after {new Date(rewardStatus.cooldownUntil || "").toLocaleString()}.</p> : null}
      {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}{notice ? <p className="mt-3 rounded-xl border border-[#eadfd5] bg-[#f7f0e9] p-3 text-xs text-[#65483c]">{notice}</p> : null}
      <button type="button" disabled={!validPhone || !selectedPlan || loadingPlans || claiming || Boolean(rewardStatus?.pending) || Number(rewardStatus?.cooldownRemainingMs || 0)>0} onClick={() => void submitClaim()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#65483c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"><ShieldCheck className="size-4" />{claiming ? "Sending request…" : rewardStatus?.pending ? "Delivery pending" : Number(rewardStatus?.cooldownRemainingMs || 0)>0 ? "Daily request used" : selectedPlan ? `Continue · ${selectedPlan.data_size} · ₦${Number(selectedPlan.price).toLocaleString("en-NG")}` : "Select a data plan"}</button>
      <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">The selected MELE plan ID is checked again on the server before purchase. No payment is taken from your Xora Points wallet.</p>
    </section>
  </main></AppShell>;
}
