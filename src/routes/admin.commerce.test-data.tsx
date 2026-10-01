import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { commerceFetch, melePlansQuery, vtusharePlansQuery, meleHealthQuery, vtushareHealthQuery, type MelePlan, type VtusharePlan } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce/test-data")({ component: TestData });

function TestData() {
  const mele = useQuery(melePlansQuery(true));
  const vt = useQuery(vtusharePlansQuery(true));
  const mh = useQuery(meleHealthQuery());
  const vh = useQuery(vtushareHealthQuery());

  const [provider, setProvider] = useState<"mele" | "vtushare">("mele");
  const [network, setNetwork] = useState("MTN");
  const [planId, setPlanId] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const melePlans = useMemo(
    () => ((mele.data?.plans || []) as MelePlan[]).filter(p => p.network === network),
    [mele.data, network],
  );
  const vtPlans = (vt.data?.plans || []) as VtusharePlan[];

  const selectedMele = melePlans.find(p => String(p.plan_id) === planId);
  const selectedVt = vtPlans.find(p =>
    String(p.bundleId) === bundleId &&
    String(p.networkId) === networkId &&
    String(p.typeId) === typeId
  );

  async function run() {
    if (!confirmed) {
      setError("Confirm the live provider charge before running the test.");
      return;
    }
    if (!phoneNumber) {
      setError("Enter the Nigerian phone number that should receive the test data.");
      return;
    }
    if (provider === "mele" && !selectedMele) {
      setError("Select a MELE plan.");
      return;
    }
    if (provider === "vtushare" && !selectedVt) {
      setError("Select a VTUshare plan.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = provider === "mele"
        ? await commerceFetch<{ ok: true; test: any }>("/api/admin/commerce/mele-test-purchase", {
            method: "POST",
            body: JSON.stringify({ network, planId: Number(planId), phoneNumber }),
          })
        : await commerceFetch<{ ok: true; test: any }>("/api/admin/commerce/vtushare-test-purchase", {
            method: "POST",
            body: JSON.stringify({
              bundleId: Number(bundleId),
              networkId: Number(networkId),
              typeId: Number(typeId),
              phoneNumber,
            }),
          });
      setResult(response.test);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test purchase failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminProtectedLayout title="Test Data" subtitle="Controlled provider purchase test — this can spend real provider wallet balance." currentSectionId="commerce-test-data">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Commerce</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Test Data Purchase</h1>
          <p className="mt-1 text-xs text-muted-foreground">Use this only with a phone number you control. The selected provider may charge the Xora provider wallet and deliver the bundle to that number.</p>
        </header>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-amber-600" />Real provider transaction</div>
          <p className="mt-1 text-muted-foreground">This is not a simulated checkout. It calls the provider's purchase API. Choose a cheap plan for the first test.</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
          <div className="flex gap-1 rounded-xl border border-border bg-muted/20 p-1 w-fit">
            <button type="button" onClick={() => { setProvider("mele"); setResult(null); setError(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${provider === "mele" ? "bg-primary text-primary-foreground" : ""}`}>MELE</button>
            <button type="button" onClick={() => { setProvider("vtushare"); setResult(null); setError(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${provider === "vtushare" ? "bg-primary text-primary-foreground" : ""}`}>VTUshare</button>
          </div>

          {provider === "mele" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={network} onChange={e => { setNetwork(e.target.value); setPlanId(""); }} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
                  {["MTN","GLO","AIRTEL","9MOBILE"].map(n => <option key={n}>{n}</option>)}
                </select>
                <select value={planId} onChange={e => setPlanId(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Select MELE plan</option>
                  {melePlans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.data_size} · ₦{p.price} · {p.validity}</option>)}
                </select>
              </div>
              <p className="text-[10px] text-muted-foreground">MELE: {mh.data?.health?.connected ? "connected" : "not connected"} · {melePlans.length} plans for {network}</p>
            </>
          ) : (
            <>
              <select value={bundleId} onChange={e => {
                const p = vtPlans.find(x => String(x.bundleId) === e.target.value);
                setBundleId(e.target.value);
                setNetworkId(p ? String(p.networkId) : "");
                setTypeId(p ? String(p.typeId) : "");
              }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                <option value="">Select VTUshare bundle</option>
                {vtPlans.map(p => <option key={`${p.bundleId}-${p.networkId}-${p.typeId}`} value={p.bundleId}>{p.network} · {p.dataSize} · ₦{p.amount}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={networkId} readOnly placeholder="Network ID" className="h-10 rounded-xl border border-input bg-muted px-3 text-sm" />
                <input value={typeId} readOnly placeholder="Type ID" className="h-10 rounded-xl border border-input bg-muted px-3 text-sm" />
              </div>
              <p className="text-[10px] text-muted-foreground">VTUshare: {vh.data?.health?.connected ? "connected" : "not connected"} · {vtPlans.length} live plans</p>
            </>
          )}

          <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} inputMode="tel" placeholder="Recipient phone number e.g. 08012345678" className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" />

          <label className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 size-4" />
            <span>I understand this test can charge the selected provider wallet and send real data to the recipient number.</span>
          </label>

          <button type="button" disabled={busy || !confirmed} onClick={() => void run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {busy ? "Running provider purchase…" : "Run real test purchase"}
          </button>

          {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</div> : null}
          {result ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />Provider accepted the purchase request</div>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 p-3 text-[10px]">{JSON.stringify(result, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </AdminProtectedLayout>
  );
}
