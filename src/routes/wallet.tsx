import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock3, Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/wallet")({ component: WalletPage });

type SurveyTransaction = {
  id: string; type: string; status: string; amount: number; description?: string;
  createdAt?: string; reference?: string;
};
type SurveyPayout = {
  id: string; amount: number; status: string; createdAt?: string;
  payoutDetails?: { accountName?: string; accountNumber?: string; bankName?: string };
};
type SurveyWalletResponse = {
  ok: true;
  wallet: { balance: number; lifetimeEarned: number; currency: "NGN"; transactions: SurveyTransaction[] };
  config: { rewardPerSurvey: number; minimumPayout: number; payoutsEnabled: boolean };
  payouts: SurveyPayout[];
};

const BANKS = [
  "Access Bank", "ALAT by Wema", "Citibank Nigeria", "Ecobank Nigeria", "FCMB",
  "Fidelity Bank", "First Bank of Nigeria", "Globus Bank", "GTBank", "Jaiz Bank",
  "Keystone Bank", "Kuda", "Moniepoint", "OPay", "PalmPay", "Polaris Bank",
  "PremiumTrust Bank", "Providus Bank", "Stanbic IBTC", "Sterling Bank",
  "UBA", "Union Bank", "Unity Bank", "Wema Bank", "Zenith Bank",
];

function money(value: number) {
  return `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}
function readableStatus(status: string) {
  const labels: Record<string, string> = {
    successful: "Approved", approved: "Approved", pending: "Pending provider confirmation",
    under_review: "Under review", requested: "Request received", on_hold: "On hold",
    paid: "Paid", rejected: "Rejected", reserved: "Reserved", failed: "Failed",
  };
  return labels[status] || status.replace(/_/g, " ");
}
function statusStyle(status: string) {
  if (["successful", "approved", "paid"].includes(status)) return "bg-emerald-500/10 text-emerald-700";
  if (["pending", "requested", "under_review", "on_hold", "reserved"].includes(status)) return "bg-amber-500/10 text-amber-700";
  if (["failed", "rejected"].includes(status)) return "bg-destructive/10 text-destructive";
  return "bg-secondary text-muted-foreground";
}

function WalletPage() {
  const { user } = useAuth();
  const [payoutStep, setPayoutStep] = useState<"closed" | "form" | "review" | "success">("closed");
  const [amount, setAmount] = useState("200");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [submittedPayout, setSubmittedPayout] = useState<SurveyPayout | null>(null);

  const surveyWallet = useQuery({
    queryKey: ["survey-wallet", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const response = await fetch(`/api/survey-wallet?userId=${encodeURIComponent(user!.id)}`, { credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not load your rewards wallet.");
      return body as SurveyWalletResponse;
    },
    refetchInterval: 15000,
  });

  if (!user) {
    return <AppShell wide><div className="mx-auto max-w-xl rounded-[28px] border border-border bg-surface p-8 text-center shadow-card">
      <Wallet className="mx-auto size-10 text-primary"/><h1 className="mt-4 font-display text-2xl font-semibold">Your rewards wallet</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to view your approved survey earnings, pending rewards and payout history.</p>
      <a href="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</a>
    </div></AppShell>;
  }

  const wallet = surveyWallet.data?.wallet;
  const config = surveyWallet.data?.config;
  const transactions = wallet?.transactions || [];
  const payouts = surveyWallet.data?.payouts || [];
  const pendingSurveyEarnings = transactions
    .filter(tx => tx.type === "survey_reward" && ["pending", "under_review"].includes(tx.status))
    .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount || 0)), 0);
  const activePayout = payouts.find(p => ["requested", "under_review", "on_hold", "approved"].includes(p.status));
  const requestedAmount = Number(amount);
  const canContinue = Number.isFinite(requestedAmount)
    && requestedAmount >= Number(config?.minimumPayout ?? 200)
    && requestedAmount <= Number(wallet?.balance || 0)
    && accountName.trim().length > 1
    && accountNumber.replace(/\D/g, "").length === 10
    && Boolean(bankName);

  function closePayout() {
    if (busy) return;
    setPayoutStep("closed");
    setNotice("");
  }

  async function submitPayout() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/survey-wallet/payout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          amount: requestedAmount,
          payoutMethod: "manual_bank_transfer",
          payoutDetails: {
            accountName: accountName.trim(),
            accountNumber: accountNumber.replace(/\D/g, ""),
            bankName,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not submit your payout request.");
      setSubmittedPayout(body.payout as SurveyPayout);
      setPayoutStep("success");
      await surveyWallet.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit your payout request.");
      setPayoutStep("form");
    } finally {
      setBusy(false);
    }
  }

  return <AppShell wide>
    <main className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
      <header className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
        <div className="relative p-5 sm:p-7">
          <div className="absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl"/>
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary"><Wallet className="size-5"/><span className="text-sm font-semibold">Xora Rewards Wallet</span></div>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your earnings, all in one place.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Track each survey reward, see what is still awaiting provider confirmation, and request a payout when your approved balance is ready. Referral earnings will be added to this same wallet later; surveys come first.</p>
            </div>
            <button onClick={() => { setNotice(""); setAmount(String(config?.minimumPayout ?? 200)); setPayoutStep("form"); }}
              disabled={!config?.payoutsEnabled || Boolean(activePayout) || Number(wallet?.balance || 0) < Number(config?.minimumPayout ?? 200)}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
              <Banknote className="size-4"/> Request payout
            </button>
          </div>
          {activePayout ? <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800"><Clock3 className="mt-0.5 size-4 shrink-0"/><span>You already have a payout request being processed ({readableStatus(activePayout.status)}). You can submit another request when it is closed.</span></div> : null}
        </div>
      </header>

      {surveyWallet.isError ? <div className="rounded-2xl border border-destructive/20 bg-surface p-4 text-sm text-destructive">{surveyWallet.error.message}</div> : null}
      {notice && payoutStep === "closed" ? <div className="rounded-2xl border border-border bg-surface p-4 text-sm">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Available to request" value={money(wallet?.balance || 0)} detail="Approved rewards not yet paid out" featured/>
        <Metric label="Approved survey earnings" value={money(wallet?.lifetimeEarned || 0)} detail="Total approved survey rewards"/>
        <Metric label="Pending survey earnings" value={money(pendingSurveyEarnings)} detail="Awaiting provider confirmation"/>
        <Metric label="Reward per approved survey" value={money(config?.rewardPerSurvey ?? 10)} detail={`Minimum payout: ${money(config?.minimumPayout ?? 200)}`}/>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:rounded-3xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold">Survey earnings activity</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Every survey is listed with its own amount and confirmation status. Pending surveys are not added to your available balance.</p></div>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary">CPX Research · connection pending</span>
        </div>
        {surveyWallet.isPending ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 size-5 animate-spin"/>Loading your wallet…</div> :
          transactions.length ? <div className="mt-4 space-y-2">{transactions.map(tx => {
            const isSurvey = tx.type === "survey_reward";
            const positive = Number(tx.amount || 0) > 0;
            return <article key={tx.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 sm:p-4">
              <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${isSurvey ? "bg-emerald-500/10 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>{isSurvey ? <CheckCircle2 className="size-5"/> : <Wallet className="size-5"/>}</div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{tx.description || (isSurvey ? "Completed survey" : tx.type.replace(/_/g, " "))}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "Date unavailable"}{tx.reference ? ` · Ref ${tx.reference}` : ""}</p>
              </div>
              <div className="shrink-0 text-right"><p className={`text-sm font-semibold ${positive ? "text-emerald-700" : "text-foreground"}`}>{positive ? "+" : "−"}{money(Math.abs(Number(tx.amount || 0)))}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle(tx.status)}`}>{readableStatus(tx.status)}</span></div>
            </article>;
          })}</div> : <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Clock3 className="size-6"/></div><h3 className="mt-3 text-sm font-semibold">No survey earnings yet</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">When CPX Research is connected, completed surveys will appear here as pending until the provider confirms them. Only approved rewards will increase your available balance.</p></div>}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:rounded-3xl sm:p-6">
        <div><h2 className="font-display text-xl font-semibold">Payout history</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Review the status of each payout request and the account it was sent to.</p></div>
        {payouts.length ? <div className="mt-4 space-y-3">{payouts.map(p => <article key={p.id} className="rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{money(p.amount)} payout</p><p className="mt-1 text-[11px] text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString() : "Date unavailable"}</p>
            {p.payoutDetails ? <p className="mt-2 text-xs text-muted-foreground">{p.payoutDetails.bankName || "Bank"} · {p.payoutDetails.accountName || "Account holder"} · ••••{String(p.payoutDetails.accountNumber || "").slice(-4)}</p> : null}
          </div><span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${statusStyle(p.status)}`}>{readableStatus(p.status)}</span></div>
        </article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Your payout requests will appear here after you submit one.</p>}
      </section>

      {payoutStep !== "closed" ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closePayout(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="payout-dialog-title" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-2xl sm:rounded-[28px] sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Xora Rewards Wallet</p><h2 id="payout-dialog-title" className="mt-2 font-display text-xl font-semibold">{payoutStep === "form" ? "Request a payout" : payoutStep === "review" ? "Confirm payout details" : "Request received"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{payoutStep === "form" ? "Enter where you would like your approved survey earnings sent." : payoutStep === "review" ? "Review everything below before sending your request." : "Your payout request has been recorded successfully."}</p></div><button onClick={closePayout} disabled={busy} aria-label="Close payout dialog" className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50"><X className="size-4"/></button></div>

          {payoutStep === "form" ? <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); if (canContinue) { setNotice(""); setPayoutStep("review"); } }}>
            <label className="block text-xs font-semibold">Payout amount (NGN)<div className="mt-1.5 flex h-12 items-center rounded-xl border border-border bg-background px-3"><span className="font-semibold">₦</span><input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="h-full w-full bg-transparent px-2 text-base font-semibold outline-none" aria-describedby="payout-limits"/></div></label>
            <p id="payout-limits" className="text-[11px] text-muted-foreground">Minimum {money(config?.minimumPayout ?? 200)} · Available {money(wallet?.balance || 0)}</p>
            <label className="block text-xs font-semibold">Bank<select value={bankName} onChange={e => setBankName(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"><option value="">Choose your bank</option>{BANKS.map(bank => <option key={bank} value={bank}>{bank}</option>)}</select></label>
            <label className="block text-xs font-semibold">Account name<input value={accountName} onChange={e => setAccountName(e.target.value)} autoComplete="name" placeholder="Name on the bank account" className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"/></label>
            <label className="block text-xs font-semibold">Account number<input value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="off" maxLength={10} placeholder="10-digit account number" className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"/></label>
            {notice ? <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{notice}</p> : null}
            <button type="submit" disabled={!canContinue} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Review request <ShieldCheck className="size-4"/></button>
          </form> : null}

          {payoutStep === "review" ? <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">You are requesting</p><p className="mt-1 font-display text-3xl font-semibold">{money(requestedAmount)}</p><div className="my-4 h-px bg-border"/><dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Bank</dt><dd className="text-right font-semibold">{bankName}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Account name</dt><dd className="text-right font-semibold">{accountName.trim()}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Account number</dt><dd className="font-semibold">{accountNumber.replace(/\D/g, "")}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Minimum payout</dt><dd className="font-semibold">{money(config?.minimumPayout ?? 200)}</dd></div></dl></div>
            <p className="text-xs leading-5 text-muted-foreground">By confirming, you submit a payout request. The requested amount will be reserved from your available balance while the request is processed. Funds are not sent automatically.</p>
            {notice ? <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{notice}</p> : null}
            <div className="grid grid-cols-2 gap-3"><button onClick={() => { setNotice(""); setPayoutStep("form"); }} disabled={busy} className="h-12 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50">Edit details</button><button onClick={() => void submitPayout()} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin"/> : <CheckCircle2 className="size-4"/>}{busy ? "Submitting…" : "Confirm & submit"}</button></div>
          </div> : null}

          {payoutStep === "success" ? <div className="mt-5 text-center"><div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-700"><CheckCircle2 className="size-7"/></div><p className="mt-4 font-display text-2xl font-semibold">{money(submittedPayout?.amount || requestedAmount)}</p><p className="mt-2 text-sm font-semibold">Payout request submitted</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Your request is now in the payout queue. You can track its status in your wallet history.</p><button onClick={() => { setPayoutStep("closed"); setAccountName(""); setAccountNumber(""); setBankName(""); setNotice(""); }} className="mt-5 h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Back to wallet</button></div> : null}
        </section>
      </div> : null}
    </main>
  </AppShell>;
}

function Metric({ label, value, detail, featured = false }: { label: string; value: string; detail: string; featured?: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${featured ? "border-primary/25 bg-primary/5" : "border-border bg-surface"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p></article>;
}
