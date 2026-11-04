import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Database, Gift, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/data-rewards")({ component: DataRewards });

// TEMPORARY: remove this bypass after the live data-claim test.
const DATA_REWARD_POINTS_TEST_BYPASS = true;

const REWARD_TIERS = [
  { id: "100mb", size: "100 MB", points: 25 },
  { id: "200mb", size: "200 MB", points: 50 },
  { id: "300mb", size: "300 MB", points: 75 },
  { id: "1gb", size: "1 GB", points: 350 },
] as const;

type PointsWallet = { points: number; lifetimeEarned: number; lifetimeRedeemed: number };
type RewardStatus = {
  status?: string;
  reference?: string;
  message?: string;
  rewardSize?: string;
  deliveredSize?: string;
  points?: number;
  completedAt?: string;
};
type DataRewardSnapshot = {
  wallet: PointsWallet;
  claim: RewardStatus | null;
  lastClaim: RewardStatus | null;
  cooldownUntil: string | null;
  cooldownRemainingMs: number;
  pending: boolean;
};

function DataRewards() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [selected, setSelected] = useState<string>("200mb");
  const [network, setNetwork] = useState<"MTN" | "GLO" | "AIRTEL" | "9MOBILE">("MTN");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [rewardStatus, setRewardStatus] = useState<Omit<DataRewardSnapshot, "wallet"> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshWallet() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const result = await commerceFetch<{ ok: true } & DataRewardSnapshot>(
        "/api/commerce/data-rewards",
      );
      setWallet(result.wallet);
      setRewardStatus({
        claim: result.claim,
        lastClaim: result.lastClaim,
        cooldownUntil: result.cooldownUntil,
        cooldownRemainingMs: result.cooldownRemainingMs,
        pending: result.pending,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your Xora Points balance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const promo = new URLSearchParams(window.location.search).get("promo");
    if (promo && /^[A-Za-z0-9_-]{10,40}$/.test(promo)) {
      window.sessionStorage.setItem("xora_data_reward_referral", promo);
    }
    void refreshWallet();
  }, [user?.id]);

  async function submitClaim() {
    if (!user || claiming) return;
    setClaiming(true);
    setError("");
    setNotice("");
    try {
      const result = await commerceFetch<{ ok: true; claim: RewardStatus }>("/api/commerce/data-rewards/claim", {
        method: "POST",
        body: JSON.stringify({
          tierId: selected,
          network,
          referralCode: new URLSearchParams(window.location.search).get("promo") || window.sessionStorage.getItem("xora_data_reward_referral") || "",
          phoneNumber: phone.replace(/\s+/g, ""),
        }),
      });
      setNotice(result.claim.message || (result.claim.status === "success"
        ? "Your data reward has been delivered."
        : "Your data request is being processed. Your points have not been deducted."));
      await refreshWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your data reward could not be claimed.");
      await refreshWallet();
    } finally {
      setClaiming(false);
    }
  }

  async function checkPendingClaim() {
    const reference = rewardStatus?.claim?.reference;
    if (!reference || checkingStatus) return;
    setCheckingStatus(true);
    setError("");
    try {
      const result = await commerceFetch<{ ok: true; claim: RewardStatus }>(
        `/api/commerce/data-rewards/claim-status?reference=${encodeURIComponent(reference)}`,
      );
      setRewardStatus((current) => current ? { ...current, claim: result.claim, pending: ["processing", "provider_pending"].includes(String(result.claim.status || "")) } : current);
      setNotice(result.claim.status === "success"
        ? "MELE confirmed delivery. Your data reward is complete."
        : result.claim.providerStatus === "not_found"
          ? "MELE returned no transaction for the previous reference. You can safely submit a fresh claim."
          : result.claim.status === "failed"
            ? "MELE confirmed that this request failed. No points were used."
            : "MELE has not confirmed delivery yet. Your request remains safely on hold.");
      await refreshWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the MELE transaction.");
    } finally {
      setCheckingStatus(false);
    }
  }

  const tier = REWARD_TIERS.find((item) => item.id === selected) || REWARD_TIERS[1];
  const validPhone = /^0[789][01]\d{8}$/.test(phone.replace(/\s+/g, ""));
  const enoughPoints = DATA_REWARD_POINTS_TEST_BYPASS || Number(wallet?.points || 0) >= tier.points;

  if (!user) {
    return <AppShell wide><main className="mx-auto max-w-md rounded-3xl border border-[#eadfd5] bg-[#fffdf9] p-7 text-center shadow-sm">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0e4d9] text-[#65483c]"><Database className="size-7" /></div>
      <h1 className="mt-4 font-display text-2xl font-semibold">Data Rewards</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to check your Xora Points and view available data rewards.</p>
      <Link to="/auth" className="mt-5 inline-flex rounded-xl bg-[#65483c] px-5 py-3 text-sm font-semibold text-white">Sign in</Link>
    </main></AppShell>;
  }

  return <AppShell wide>
    <main className="mx-auto w-full max-w-2xl space-y-5 pb-8">
      <header className="flex items-center gap-3">
        <Link to="/offers" aria-label="Back to offers" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#eadfd5] bg-[#fffdf9] text-[#65483c]"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8b6b5d]">XoraTV rewards</p><h1 className="font-display text-2xl font-semibold">Data Rewards</h1></div>
        <button type="button" onClick={() => void refreshWallet()} disabled={loading} aria-label="Refresh points balance" className="grid size-10 place-items-center rounded-xl border border-[#eadfd5] bg-[#fffdf9] text-[#65483c] disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
      </header>

      <section className="rounded-[24px] border border-[#eadfd5] bg-[#fffdf9] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#f0e4d9] text-[#65483c]"><Gift className="size-5" /></div>
          <div><p className="text-sm font-semibold text-[#3d302b]">Points requirement paused</p><p className="mt-1 text-xs text-muted-foreground">Data claims currently require no Xora Points. Your points balance will not be changed.</p></div>
        </div>
      </section>

      <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Choose your data reward</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One successful claim every 24 hours. The points requirement is temporarily disabled.</p></div><span className="rounded-full bg-[#f3e9df] px-3 py-1.5 text-[10px] font-semibold text-[#65483c]">XoraTV data</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {REWARD_TIERS.map((item) => {
            const active = selected === item.id;
            const affordable = DATA_REWARD_POINTS_TEST_BYPASS || Number(wallet?.points || 0) >= item.points;
            return <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#65483c] bg-[#f4ebe3] ring-1 ring-[#65483c]" : "border-[#eadfd5] bg-white hover:border-[#c8b3a4]"}`}>
              <div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Database className="size-4" /></div>{active ? <CheckCircle2 className="size-5 text-[#65483c]" /> : <span className="size-5 rounded-full border border-[#d8c8bc]" />}</div>
              <p className="mt-4 font-display text-2xl font-semibold text-[#3d302b]">{item.size}</p>
              <p className="mt-1 text-sm font-bold text-[#65483c]">{DATA_REWARD_POINTS_TEST_BYPASS ? "No points required" : `${item.points} points`}</p>
              <p className={`mt-2 text-[10px] font-medium ${affordable ? "text-emerald-700" : "text-muted-foreground"}`}>{DATA_REWARD_POINTS_TEST_BYPASS ? "Temporary claim test" : affordable ? "Points available" : "More points needed"}</p>
            </button>;
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Smartphone className="size-5" /></div><div><h2 className="text-base font-semibold">Where should we send it?</h2><p className="text-xs text-muted-foreground">Enter the Nigerian phone number to receive your data.</p></div></div>
        <label className="mt-4 block text-xs font-semibold text-foreground">Mobile network<select value={network} onChange={(e) => setNetwork(e.target.value as typeof network)} className="mt-2 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:border-[#8b6b5d]"><option value="MTN">MTN</option><option value="GLO">Glo</option><option value="AIRTEL">Airtel</option><option value="9MOBILE">9mobile</option></select></label>
        <label className="mt-4 block text-xs font-semibold text-foreground">Recipient phone number<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 13))} inputMode="tel" autoComplete="tel" placeholder="08012345678" className="mt-2 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:border-[#8b6b5d]" /></label>
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f7f0e9] p-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#65483c]" /><p className="text-[11px] leading-5 text-[#6e5a50]">One successful claim every 24 hours. Points are temporarily disabled. Failed deliveries do not use your daily claim.</p></div>
        {rewardStatus?.pending ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Your previous data request is awaiting MELE confirmation. No points are required, and another claim is paused to prevent duplicate purchases.</p><button type="button" onClick={() => void checkPendingClaim()} disabled={checkingStatus} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 font-semibold disabled:opacity-50"><RefreshCw className={`size-3 ${checkingStatus ? "animate-spin" : ""}`} />{checkingStatus ? "Checking MELE…" : "Check transaction status"}</button></div> : null}
        {rewardStatus?.cooldownRemainingMs ? <p className="mt-3 rounded-xl border border-[#eadfd5] bg-[#f7f0e9] p-3 text-xs text-[#65483c]">Your next data reward is available after {new Date(rewardStatus.cooldownUntil || "").toLocaleString()}.</p> : null}
        {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-xl border border-[#eadfd5] bg-[#f7f0e9] p-3 text-xs text-[#65483c]">{notice}</p> : null}
        <button type="button" disabled={!validPhone || !enoughPoints || loading || claiming || Boolean(rewardStatus?.pending) || Number(rewardStatus?.cooldownRemainingMs || 0) > 0} onClick={() => void submitClaim()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#65483c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
          <ShieldCheck className="size-4" /> {claiming ? "Sending data…" : rewardStatus?.pending ? "Delivery pending" : Number(rewardStatus?.cooldownRemainingMs || 0) > 0 ? "Daily claim used" : DATA_REWARD_POINTS_TEST_BYPASS ? `Test claim ${tier.size} · no points` : `Claim ${tier.size} · ${tier.points} points`}
        </button>
        <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">Your data is sent to the selected number. Xora Points are only deducted after successful delivery confirmation.</p>
      </section>
    </main>
  </AppShell>;
}
