import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Banknote, Clock3, Loader2, Wallet } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { commerceFetch, walletQuery, walletDepositStatusQuery } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/wallet")({ component: WalletPage });

function WalletPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [surveyPayoutAmount, setSurveyPayoutAmount] = useState("200");
  const [surveyAccountName, setSurveyAccountName] = useState("");
  const [surveyAccountNumber, setSurveyAccountNumber] = useState("");
  const [surveyBankName, setSurveyBankName] = useState("");
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [surveyNotice, setSurveyNotice] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const reference = params?.get("deposit");
  const returnTo = params?.get("returnTo") || "/";

  const { data, refetch } = useQuery(walletQuery(user?.id));
  const surveyWallet = useQuery({ queryKey: ["survey-wallet", user?.id], enabled: Boolean(user?.id), queryFn: async () => { const response = await fetch(`/api/survey-wallet?userId=${encodeURIComponent(user!.id)}`); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Could not load survey wallet."); return body as { ok: true; wallet: { balance: number; lifetimeEarned: number; transactions: any[] }; config: { rewardPerSurvey: number; minimumPayout: number; payoutsEnabled: boolean }; payouts: any[] }; } });
  const deposit = useQuery(walletDepositStatusQuery(user?.id, reference));

  if (!user) {
    return (
      <AppShell wide>
        <div className="mx-auto max-w-xl rounded-[30px] border border-border bg-surface p-8 text-center shadow-card">
          <Wallet className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Your Xora Wallet</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to view your balance and use your wallet across Xora.</p>
          <a href="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</a>
        </div>
      </AppShell>
    );
  }

  async function requestSurveyPayout() {
    const amountValue = Number(surveyPayoutAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) { setSurveyNotice("Enter a valid payout amount."); return; }
    if (!surveyAccountName.trim() || surveyAccountNumber.replace(/\D/g, "").length !== 10 || !surveyBankName.trim()) { setSurveyNotice("Enter your account name, 10-digit account number, and bank."); return; }
    setSurveyBusy(true); setSurveyNotice("");
    try {
      const response = await fetch("/api/survey-wallet/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user!.id, amount: amountValue, payoutMethod: "manual_bank_transfer", payoutDetails: { accountName: surveyAccountName.trim(), accountNumber: surveyAccountNumber.replace(/\D/g, ""), bankName: surveyBankName.trim() } }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not request payout.");
      setSurveyNotice("Payout request submitted. The requested amount is reserved while the request is processed.");
      await surveyWallet.refetch();
    } catch (e) { setSurveyNotice(e instanceof Error ? e.message : "Could not request payout."); }
    finally { setSurveyBusy(false); }
  }

  async function requestFunding() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 100) {
      setNotice("Enter at least ₦100.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await commerceFetch<any>("/api/commerce/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, amount: value }),
      });
      setNotice(`Funding reference ${result.deposit.reference} created. A payment provider is not connected to Xora yet, so the wallet has not been credited.`);
      await refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not create funding request.");
    } finally {
      setBusy(false);
    }
  }

  const status = deposit.data?.deposit?.status;

  return (
    <AppShell wide>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <header className="rounded-[24px] border border-border bg-surface p-4 shadow-card sm:rounded-[30px] sm:p-6">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Wallet className="size-5" />
                <span className="text-sm font-semibold">Xora Wallet</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">One balance for Xora.</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Your wallet is the payment source for mobile data and paid courses.
              </p>
            </div>
            <div className="w-full rounded-2xl bg-primary/10 px-4 py-3 sm:w-auto sm:px-5 sm:text-right">
              <p className="text-xs text-muted-foreground">Available balance</p>
              <p className="mt-1 text-3xl font-semibold">₦{Number(data?.wallet?.balance || 0).toLocaleString()}</p>
            </div>
          </div>
        </header>

        <section className="rounded-[24px] border border-primary/20 bg-surface p-4 shadow-card sm:rounded-3xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-primary"><Banknote className="size-5"/><span className="text-sm font-semibold">Survey rewards wallet</span></div><h2 className="mt-2 font-display text-xl font-semibold">Earn from eligible surveys</h2><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">This balance is separate from your Xora shopping balance. Survey rewards will be credited after CPX Research verification is connected.</p></div>
            <div className="rounded-2xl bg-primary/10 px-4 py-3"><p className="text-xs text-muted-foreground">Available survey balance</p><p className="mt-1 text-2xl font-semibold">₦{Number(surveyWallet.data?.wallet?.balance || 0).toLocaleString()}</p></div>
          </div>
          {surveyWallet.isError ? <p className="mt-3 text-xs text-destructive">{surveyWallet.error.message}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">Lifetime survey earnings</p><p className="mt-1 text-lg font-semibold">₦{Number(surveyWallet.data?.wallet?.lifetimeEarned || 0).toLocaleString()}</p></div><div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">Minimum payout</p><p className="mt-1 text-lg font-semibold">₦{Number(surveyWallet.data?.config?.minimumPayout || 200).toLocaleString()}</p></div><div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">Reward per approved survey</p><p className="mt-1 text-lg font-semibold">₦{Number(surveyWallet.data?.config?.rewardPerSurvey ?? 10).toLocaleString()}</p></div></div>
          {surveyNotice ? <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs leading-5">{surveyNotice}</div> : null}
          <div className="mt-5 rounded-2xl border border-border bg-background p-4"><h3 className="text-sm font-semibold">Request a payout</h3><p className="mt-1 text-xs text-muted-foreground">Manual bank transfer. Your requested amount is reserved while processing; rejected requests release the amount back to your available balance.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Amount (₦)<input inputMode="decimal" value={surveyPayoutAmount} onChange={e=>setSurveyPayoutAmount(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"/></label><label className="text-xs font-medium">Bank name<input value={surveyBankName} onChange={e=>setSurveyBankName(e.target.value)} placeholder="e.g. OPay, GTBank" className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"/></label><label className="text-xs font-medium">Account name<input value={surveyAccountName} onChange={e=>setSurveyAccountName(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"/></label><label className="text-xs font-medium">Account number<input inputMode="numeric" maxLength={10} value={surveyAccountNumber} onChange={e=>setSurveyAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"/></label></div>
            <button onClick={()=>void requestSurveyPayout()} disabled={surveyBusy || surveyWallet.data?.config?.payoutsEnabled===false || Number(surveyWallet.data?.wallet?.balance||0)<Number(surveyPayoutAmount)} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{surveyBusy?<Loader2 className="size-4 animate-spin"/>:<Banknote className="size-4"/>}{surveyBusy?"Submitting…":"Request survey payout"}</button>
            {surveyWallet.data?.config?.payoutsEnabled===false ? <p className="mt-2 text-xs text-muted-foreground">Payout requests are temporarily disabled.</p> : null}
          </div>
          <div className="mt-5"><h3 className="text-sm font-semibold">Survey transactions</h3>{(surveyWallet.data?.wallet?.transactions || []).length ? <div className="mt-2 space-y-2">{surveyWallet.data!.wallet.transactions.map((tx:any)=><div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><p className="text-xs font-semibold">{tx.description || tx.type || "Survey wallet activity"}</p><p className="mt-1 text-[10px] text-muted-foreground">{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ""} · {tx.status || "recorded"}</p></div><p className={`text-sm font-semibold ${Number(tx.amount)>=0?"text-emerald-600":"text-foreground"}`}>{Number(tx.amount)>=0?"+":""}₦{Math.abs(Number(tx.amount||0)).toLocaleString()}</p></div>)}</div> : <p className="mt-2 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No survey rewards yet. CPX Research will be connected after the wallet workflow is tested.</p>}</div>
          <div className="mt-5"><h3 className="text-sm font-semibold">Payout history</h3>{(surveyWallet.data?.payouts || []).length ? <div className="mt-2 space-y-2">{surveyWallet.data!.payouts.map((p:any)=><div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><p className="text-xs font-semibold">₦{Number(p.amount).toLocaleString()} payout</p><p className="mt-1 text-[10px] text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString() : ""}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold">{p.status}</span></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No payout requests yet.</p>}</div>
        </section>

        {notice ? <div className="rounded-2xl border border-border bg-surface p-4 text-sm">{notice}</div> : null}

        {reference && status === "pending" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
            <Clock3 className="size-5 text-primary" />
            Funding request <strong>{reference}</strong> is still pending.
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-border bg-surface p-4 shadow-card sm:rounded-3xl sm:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ArrowDownToLine className="size-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Deposit funds</h2>
                <p className="text-sm text-muted-foreground">Fund your Xora balance, then use it for mobile data and paid courses.</p>
              </div>
            </div>

            <label className="mt-5 block text-xs font-semibold text-muted-foreground">Amount</label>
            <div className="mt-2 flex items-center rounded-2xl border border-input bg-background px-4">
              <span className="text-sm font-semibold">₦</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-full bg-transparent px-2 py-3 text-lg font-semibold outline-none" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[500, 1000, 5000].map((value) => (
                <button key={value} onClick={() => setAmount(String(value))} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary">
                  ₦{value.toLocaleString()}
                </button>
              ))}
            </div>

            <button onClick={() => void requestFunding()} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
              {busy ? "Preparing deposit…" : "Prepare deposit"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The wallet ledger and deposit flow are ready. No external payment provider has been connected yet, so preparing a deposit does not credit the balance.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Wallet activity</h2>
            <div className="mt-4 space-y-2">
              {(data?.wallet?.transactions || []).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
                  <div>
                    <p className="text-sm font-semibold">{tx.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={Number(tx.amount) < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-600"}>
                    {Number(tx.amount) < 0 ? "−" : "+"}₦{Math.abs(Number(tx.amount || 0)).toLocaleString()}
                  </span>
                </div>
              ))}
              {!(data?.wallet?.transactions || []).length ? <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No wallet activity yet.</div> : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-primary/15 bg-primary/5 p-5">
          <h2 className="font-display text-lg font-semibold">Use your wallet</h2>
          <p className="mt-1 text-sm text-muted-foreground">If a purchase does not have enough funds, Xora sends the user here. If the balance is sufficient, the purchase is debited server-side.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={returnTo === "/data" ? "/data" : "/data"} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Buy Data</a>
            <a href={returnTo === "/learn" ? "/learn" : "/learn"} className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold">Explore Courses</a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
