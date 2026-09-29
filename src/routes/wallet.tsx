import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Clock3, Loader2, WalletCards } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { commerceFetch, walletQuery, walletDepositStatusQuery } from "@/lib/commerce";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/wallet")({ component: WalletPage });

function WalletPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const reference = params?.get("deposit");
  const returnTo = params?.get("returnTo") || "/";

  const { data, refetch } = useQuery(walletQuery(user?.id));
  const deposit = useQuery(walletDepositStatusQuery(user?.id, reference));

  if (!user) {
    return (
      <AppShell wide>
        <div className="mx-auto max-w-xl rounded-[30px] border border-border bg-surface p-8 text-center shadow-card">
          <WalletCards className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Your Xora Wallet</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to view your balance and use your wallet across Xora.</p>
          <a href="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</a>
        </div>
      </AppShell>
    );
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
      <div className="space-y-6">
        <header className="rounded-[30px] border border-border bg-surface p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <WalletCards className="size-5" />
                <span className="text-sm font-semibold">Xora Wallet</span>
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold">One balance for Xora.</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Your wallet is the payment source for mobile data and paid courses.
              </p>
            </div>
            <div className="rounded-2xl bg-primary/10 px-5 py-3 sm:text-right">
              <p className="text-xs text-muted-foreground">Available balance</p>
              <p className="mt-1 text-3xl font-semibold">₦{Number(data?.wallet?.balance || 0).toLocaleString()}</p>
            </div>
          </div>
        </header>

        {notice ? <div className="rounded-2xl border border-border bg-surface p-4 text-sm">{notice}</div> : null}

        {reference && status === "pending" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
            <Clock3 className="size-5 text-primary" />
            Funding request <strong>{reference}</strong> is still pending.
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-card">
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
