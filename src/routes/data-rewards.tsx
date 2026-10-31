import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Database, Gift, Loader2, RefreshCw, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/data-rewards")({ component: DataRewards });

const REWARD_TIERS = [
  { id: "100mb", size: "100 MB", points: 25 },
  { id: "200mb", size: "200 MB", points: 50 },
  { id: "300mb", size: "300 MB", points: 75 },
  { id: "1gb", size: "1 GB", points: 350 },
] as const;

type PointsWallet = { points: number; lifetimeEarned: number; lifetimeRedeemed: number };

function DataRewards() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [selected, setSelected] = useState<string>("200mb");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshWallet() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const result = await commerceFetch<{ ok: true; wallet: PointsWallet }>(
        `/api/offers/wallet?userId=${encodeURIComponent(user.id)}`,
      );
      setWallet(result.wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your Xora Points balance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refreshWallet(); }, [user?.id]);

  const tier = REWARD_TIERS.find((item) => item.id === selected) || REWARD_TIERS[1];
  const validPhone = /^0[789][01]\d{8}$/.test(phone.replace(/\s+/g, ""));
  const enoughPoints = Number(wallet?.points || 0) >= tier.points;

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

      <section className="relative overflow-hidden rounded-[28px] bg-[#65483c] p-5 text-white shadow-sm">
        <div className="absolute -right-8 -top-10 size-40 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2 text-sm font-medium text-white/80"><Sparkles className="size-4" /> Your Xora Points</div>
            <p className="mt-3 font-display text-4xl font-semibold tracking-tight">{loading && wallet === null ? "…" : Number(wallet?.points || 0).toLocaleString()} <span className="text-lg font-medium text-white/75">XP</span></p>
            <p className="mt-2 text-xs text-white/70">Available points for data rewards</p>
          </div>
          <div className="grid size-12 place-items-center rounded-2xl bg-white/10"><Gift className="size-6" /></div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
          <div><p className="text-[10px] text-white/65">Lifetime earned</p><p className="mt-1 text-sm font-semibold">{Number(wallet?.lifetimeEarned || 0).toLocaleString()} XP</p></div>
          <div><p className="text-[10px] text-white/65">Lifetime redeemed</p><p className="mt-1 text-sm font-semibold">{Number(wallet?.lifetimeRedeemed || 0).toLocaleString()} XP</p></div>
        </div>
      </section>

      <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Choose your data reward</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One successful claim every 24 hours. Points are shown beside each bundle.</p></div><span className="rounded-full bg-[#f3e9df] px-3 py-1.5 text-[10px] font-semibold text-[#65483c]">MELE data</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {REWARD_TIERS.map((item) => {
            const active = selected === item.id;
            const affordable = Number(wallet?.points || 0) >= item.points;
            return <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#65483c] bg-[#f4ebe3] ring-1 ring-[#65483c]" : "border-[#eadfd5] bg-white hover:border-[#c8b3a4]"}`}>
              <div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Database className="size-4" /></div>{active ? <CheckCircle2 className="size-5 text-[#65483c]" /> : <span className="size-5 rounded-full border border-[#d8c8bc]" />}</div>
              <p className="mt-4 font-display text-2xl font-semibold text-[#3d302b]">{item.size}</p>
              <p className="mt-1 text-sm font-bold text-[#65483c]">{item.points} points</p>
              <p className={`mt-2 text-[10px] font-medium ${affordable ? "text-emerald-700" : "text-muted-foreground"}`}>{affordable ? "Points available" : "More points needed"}</p>
            </button>;
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-[#eadfd5] bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#f0e4d9] text-[#65483c]"><Smartphone className="size-5" /></div><div><h2 className="text-base font-semibold">Where should we send it?</h2><p className="text-xs text-muted-foreground">Enter the Nigerian phone number to receive your data.</p></div></div>
        <label className="mt-4 block text-xs font-semibold text-foreground">Recipient phone number<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 13))} inputMode="tel" autoComplete="tel" placeholder="08012345678" className="mt-2 h-12 w-full rounded-xl border border-[#e5d8cc] bg-white px-3 text-sm outline-none focus:border-[#8b6b5d]" /></label>
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f7f0e9] p-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#65483c]" /><p className="text-[11px] leading-5 text-[#6e5a50]">A successful reward claim starts your 24-hour cooldown. Failed provider attempts will not use your daily claim.</p></div>
        {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-xl border border-[#eadfd5] bg-[#f7f0e9] p-3 text-xs text-[#65483c]">{notice}</p> : null}
        <button type="button" disabled={!validPhone || !enoughPoints || loading} onClick={() => setNotice("Reward fulfilment is not open yet. Your points have not been deducted.")} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#65483c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
          <ShieldCheck className="size-4" /> Claim {tier.size} · {tier.points} points
        </button>
        <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">Your Xora Points are not deducted on this preview. Claims will open after secure MELE fulfilment and duplicate-claim protection are connected.</p>
      </section>
    </main>
  </AppShell>;
}
