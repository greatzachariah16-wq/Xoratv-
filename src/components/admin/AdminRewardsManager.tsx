import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Coins,
  Database,
  ExternalLink,
  Info,
  Layers,
  Power,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Wifi,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { RewardConfig, RewardTransaction, VtusharePlan } from "@/lib/rewards/types";
import { getAdminAuthHeaders } from "@/hooks/useAdminAuth";

interface AdminRewardsOverview {
  ok: boolean;
  config: RewardConfig;
  provider: {
    name: string;
    isConfigured: boolean;
    emailMasked: string;
    cachedBalance: number | null;
    isLowBalance: boolean;
    minBalanceThreshold: number;
  };
  metrics: {
    totalDelivered: number;
    totalPending: number;
    totalFailed: number;
    totalSpentNgn: number;
    transactionCount: number;
  };
  transactions: (RewardTransaction & { phoneDisplay: string })[];
}

export function AdminRewardsManager() {
  const [data, setData] = useState<AdminRewardsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingPlans, setIsRefreshingPlans] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  // Form states
  const [enabled, setEnabled] = useState(true);
  const [rewardDataSize, setRewardDataSize] = useState("1GB");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [maxDailyBudget, setMaxDailyBudget] = useState(50000);
  const [maxRewardsPerUser, setMaxRewardsPerUser] = useState(1);
  const [minBalanceThreshold, setMinBalanceThreshold] = useState(200);

  // Controlled test tool states
  const [testPhone, setTestPhone] = useState("");
  const [testBundle, setTestBundle] = useState("990");
  const [testType, setTestType] = useState("25");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: string;
    message: string;
    ref?: string | null;
    balanceAfter?: number;
  } | null>(null);

  const fetchOverview = async (showToast = false) => {
    try {
      if (showToast) setLoading(true);
      const res = await fetch("/api/admin/rewards/overview", {
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to load reward overview (HTTP ${res.status})`);
      }

      const json = (await res.json()) as AdminRewardsOverview;
      if (json.ok) {
        setData(json);
        setEnabled(json.config.enabled);
        setRewardDataSize(json.config.rewardDataSize || "1GB");
        setSelectedPlanId(json.config.selectedPlan?.id || "");
        setMaxDailyBudget(json.config.maxDailyBudget || 50000);
        setMaxRewardsPerUser(json.config.maxRewardsPerUser || 1);
        setMinBalanceThreshold(json.config.minBalanceThreshold ?? 200);
        if (showToast) toast.success("Rewards configuration reloaded.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading rewards overview";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview();
  }, []);

  const handleSaveConfig = async () => {
    if (!data) return;
    setIsSaving(true);
    try {
      const activePlans = data.config.cachedPlans || [];
      const planToSelect =
        activePlans.find((p) => p.id === selectedPlanId) || data.config.selectedPlan;

      const res = await fetch("/api/admin/rewards/config", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          enabled,
          rewardDataSize,
          selectedPlan: planToSelect,
          maxDailyBudget: Number(maxDailyBudget),
          maxRewardsPerUser: Number(maxRewardsPerUser),
          minBalanceThreshold: Number(minBalanceThreshold),
        }),
      });

      const json = await res.json();
      if (json.ok) {
        toast.success("Rewards configuration successfully saved.");
        await fetchOverview();
      } else {
        toast.error(json.error || "Failed to update configuration.");
      }
    } catch {
      toast.error("Network error while updating configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshPlans = async () => {
    setIsRefreshingPlans(true);
    try {
      const res = await fetch("/api/admin/rewards/refresh-plans", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`Refreshed ${json.plans?.length || 0} plans from VTUshare (${json.source}).`);
        await fetchOverview();
      } else {
        toast.error(json.error || "Failed to refresh plans from VTUshare.");
      }
    } catch {
      toast.error("Network error refreshing plans.");
    } finally {
      setIsRefreshingPlans(false);
    }
  };

  const handleCheckBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const res = await fetch("/api/admin/rewards/check-balance", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok && typeof json.balance === "number") {
        toast.success(`Live VTUshare Wallet Balance: ₦${json.balance.toLocaleString()}`);
        await fetchOverview();
      } else {
        toast.error(json.error || "Failed to fetch live balance from VTUshare.");
      }
    } catch {
      toast.error("Network error checking live balance.");
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const handleRunTestTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Please enter a destination phone number for the test.");
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/rewards/test-transaction", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          phone: testPhone.trim(),
          bundle: testBundle,
          type: testType,
        }),
      });

      const json = await res.json();
      setTestResult(json);
      if (json.ok) {
        toast.success(`Test transaction executed! Status: ${json.status}`);
        await fetchOverview();
      } else {
        toast.error(json.message || "Test transaction was rejected by VTUshare.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test transaction failed";
      toast.error(msg);
    } finally {
      setIsSendingTest(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-xs text-muted-foreground">
          Loading VTUshare reward automation engine...
        </p>
      </div>
    );
  }

  const isLowBalance = data?.provider.isLowBalance ?? false;
  const isConfigured = data?.provider.isConfigured ?? false;
  const plans = data?.config.cachedPlans || [];

  return (
    <section id="data-rewards" className="space-y-6 scroll-mt-6">
      {/* Section Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Wifi className="size-4" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Automation Engine
            </p>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Automated MTN Data Rewards (VTUshare)
          </h2>
          <p className="text-xs text-muted-foreground">
            Sovereign control center for automated normal-user 1GB MTN data reward fulfillment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOverview(true)}
            className="h-9 gap-1.5 rounded-full text-xs"
          >
            <RefreshCw className="size-3.5" /> Reload
          </Button>
        </div>
      </div>

      {/* Low Balance or Configuration Alert Banner */}
      {!isConfigured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <Info className="size-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-sm">VTUshare Backend Credentials Pending</p>
              <p className="mt-1 text-muted-foreground">
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
                  VTUSHARE_EMAIL
                </code>{" "}
                and{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
                  VTUSHARE_PASSWORD
                </code>{" "}
                must be declared in your backend server environment. The system will use cached
                catalog fallbacks until credentials are live.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLowBalance && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <ShieldAlert className="size-5 shrink-0 text-rose-500 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-sm">Low VTUshare Wallet Balance Warning</p>
              <p className="mt-1">
                Your VTUshare balance is{" "}
                <strong>₦{data?.provider.cachedBalance?.toLocaleString() ?? 0}</strong>, which is
                below the minimum safety threshold of{" "}
                <strong>₦{data?.provider.minBalanceThreshold?.toLocaleString()}</strong>. Top up
                your VTUshare wallet to prevent telco fulfillment interruptions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Provider Wallet</span>
            <button
              type="button"
              onClick={handleCheckBalance}
              disabled={isCheckingBalance}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
              title="Refresh live wallet balance from VTUshare"
            >
              <RefreshCw className={`size-3 ${isCheckingBalance ? "animate-spin" : ""}`} />
              Check Live
            </button>
          </div>
          <p className="mt-2 font-display text-2xl font-bold">
            {data?.provider.cachedBalance !== null && data?.provider.cachedBalance !== undefined
              ? `₦${data.provider.cachedBalance.toLocaleString()}`
              : "₦0"}
          </p>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Account: {data?.provider.emailMasked}
          </span>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Delivered Rewards</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {data?.metrics.totalDelivered ?? 0}
          </p>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Total fulfilled: ₦{(data?.metrics.totalSpentNgn ?? 0).toLocaleString()}
          </span>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Pending Delivery</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
            {data?.metrics.totalPending ?? 0}
          </p>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Telco gateway routing
          </span>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Engine State</span>
            <Power className={`size-4 ${enabled ? "text-emerald-500" : "text-rose-500"}`} />
          </div>
          <p className="mt-2 font-display text-2xl font-bold">{enabled ? "Active" : "Paused"}</p>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Reward: {data?.config.rewardDataSize || "1GB"} MTN
          </span>
        </article>
      </div>

      {/* Configuration & Testing Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration Card */}
        <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-card">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <h3 className="font-display text-base font-semibold">Reward Policy Settings</h3>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="reward-engine-toggle" className="text-xs font-medium cursor-pointer">
                {enabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch id="reward-engine-toggle" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <div className="mt-5 space-y-4 text-xs">
            <div>
              <Label className="text-xs font-semibold">Reward Data Size</Label>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {["500MB", "1GB", "2GB", "3GB"].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setRewardDataSize(sz)}
                    className={`rounded-xl border py-2 text-xs font-semibold transition ${
                      rewardDataSize === sz
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="plan-selector" className="text-xs font-semibold">
                Selected MTN Telco Plan
              </Label>
              <select
                id="plan-selector"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ₦{p.price} (Bundle: {p.bundle}, Type: {p.type.toUpperCase()})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Determines the exact bundle ID and type sent to VTUshare for fulfillment.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="max-budget" className="text-xs font-semibold">
                  Daily Budget Ceiling (₦)
                </Label>
                <Input
                  id="max-budget"
                  type="number"
                  value={maxDailyBudget}
                  onChange={(e) => setMaxDailyBudget(Number(e.target.value))}
                  className="mt-1 h-9 rounded-xl text-xs"
                />
              </div>

              <div>
                <Label htmlFor="max-rewards" className="text-xs font-semibold">
                  Max Rewards / User
                </Label>
                <Input
                  id="max-rewards"
                  type="number"
                  min={1}
                  max={10}
                  value={maxRewardsPerUser}
                  onChange={(e) => setMaxRewardsPerUser(Number(e.target.value))}
                  className="mt-1 h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="min-balance" className="text-xs font-semibold">
                Low Balance Alert Threshold (₦)
              </Label>
              <Input
                id="min-balance"
                type="number"
                value={minBalanceThreshold}
                onChange={(e) => setMinBalanceThreshold(Number(e.target.value))}
                className="mt-1 h-9 rounded-xl text-xs"
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="w-full rounded-full text-xs font-semibold"
              >
                {isSaving ? "Saving Configuration..." : "Apply Reward Configuration"}
              </Button>
            </div>
          </div>
        </div>

        {/* Controlled Test Transaction Card */}
        <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Send className="size-4 text-emerald-500" />
                <h3 className="font-display text-base font-semibold">
                  Controlled Test Transaction
                </h3>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Safe Mode
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Execute a single controlled 500MB/1GB purchase to an admin-specified Nigerian MTN
              phone number to verify VTUshare authorization, telco routing, and response parsing
              before opening claims to viewers.
            </p>

            <form onSubmit={handleRunTestTransaction} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="test-phone" className="text-xs font-semibold">
                  Recipient Nigerian MTN Phone Number
                </Label>
                <div className="relative mt-1">
                  <Smartphone className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="test-phone"
                    placeholder="e.g. 08031234567 or 08101234567"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="h-10 pl-9 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="test-plan" className="text-xs font-semibold">
                  Test Plan (VTUshare Catalog)
                </Label>
                <select
                  id="test-plan"
                  value={`${testBundle}_${testType}`}
                  onChange={(e) => {
                    const [b, t] = e.target.value.split("_");
                    setTestBundle(b);
                    setTestType(t);
                  }}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                >
                  <option value="990_25">MTN 1GB AWOOF 30 Days (₦280) — Best Value</option>
                  <option value="988_56">MTN 1GB SME 1 Day (₦300) — Direct Wholesale</option>
                  <option value="878_11">MTN 500MB DATASHARE (₦400)</option>
                  <option value="991_25">MTN 2GB AWOOF 30 Days (₦560)</option>
                  {data?.provider.plans
                    ?.filter((p) => p.bundle !== "990" && p.bundle !== "988")
                    .slice(0, 15)
                    .map((p) => (
                      <option key={p.id} value={`${p.bundle}_${p.type}`}>
                        {p.name} (₦{p.price})
                      </option>
                    ))}
                </select>
              </div>

              <Button
                type="submit"
                variant="secondary"
                disabled={isSendingTest}
                className="w-full mt-2 rounded-full text-xs font-semibold border border-border hover:bg-primary hover:text-primary-foreground transition"
              >
                {isSendingTest ? "Transacting with VTUshare..." : "Dispatch Test Transaction"}
              </Button>
            </form>

            {testResult && (
              <div
                className={`mt-4 rounded-2xl border p-3 text-xs ${
                  testResult.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 text-rose-500" />
                  )}
                  <span>Status: {testResult.status}</span>
                </div>
                <p className="mt-1">{testResult.message}</p>
                {testResult.ref && (
                  <p className="mt-1 font-mono text-[10px] opacity-80">
                    Reference: {testResult.ref}
                  </p>
                )}
                {testResult.balanceAfter !== undefined && (
                  <p className="mt-0.5 text-[11px] font-semibold">
                    Balance After: ₦{testResult.balanceAfter.toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Webhook Destination URL:</span>
            <code className="font-mono text-[10px] bg-background px-1.5 py-0.5 rounded border">
              /api/rewards/webhook/vtushare
            </code>
          </div>
        </div>
      </div>

      {/* Plan Catalog Explorer */}
      <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <h3 className="font-display text-base font-semibold">VTUshare MTN Plan Catalog</h3>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dynamic plan IDs synchronized from VTUshare API. Updated dynamically to prevent broken
              bundle IDs.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPlans}
            disabled={isRefreshingPlans}
            className="h-9 gap-1.5 rounded-full text-xs"
          >
            <RefreshCw className={`size-3.5 ${isRefreshingPlans ? "animate-spin" : ""}`} />
            {isRefreshingPlans ? "Syncing..." : "Sync Live Catalog"}
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2.5 font-semibold">Plan Name</th>
                <th className="pb-2.5 font-semibold">Data Size</th>
                <th className="pb-2.5 font-semibold">Network ID</th>
                <th className="pb-2.5 font-semibold">Bundle ID</th>
                <th className="pb-2.5 font-semibold">Type ID</th>
                <th className="pb-2.5 font-semibold">Price (₦)</th>
                <th className="pb-2.5 font-semibold">Validity</th>
                <th className="pb-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {plans.map((p) => {
                const isSelected = p.id === selectedPlanId;
                return (
                  <tr key={p.id} className={isSelected ? "bg-primary/5" : ""}>
                    <td className="py-2.5 font-medium flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      {p.name}
                    </td>
                    <td className="py-2.5 font-semibold">{p.size}</td>
                    <td className="py-2.5 font-mono text-[11px] text-muted-foreground">
                      {p.networkId}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] font-semibold">{p.bundle}</td>
                    <td className="py-2.5 font-mono text-[11px] uppercase text-muted-foreground">
                      {p.type}
                    </td>
                    <td className="py-2.5 font-semibold">₦{p.price}</td>
                    <td className="py-2.5 text-muted-foreground">{p.validity || "30 days"}</td>
                    <td className="py-2.5 text-right">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                          <CheckCircle2 className="size-3" /> Active Reward
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPlanId(p.id);
                            toast.info(`Selected ${p.name}. Click "Apply" above to save.`);
                          }}
                          className="h-6 rounded-full px-2 text-[10px]"
                        >
                          Select
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Audit Log Table */}
      <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="font-display text-base font-semibold">Reward Transaction Audit Log</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Immutable ledger of all user reward requests, telco references, and delivery
              confirmations.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {data?.transactions.length ?? 0} transactions
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          {data?.transactions && data.transactions.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2.5 font-semibold">Xora Tx ID</th>
                  <th className="pb-2.5 font-semibold">User ID</th>
                  <th className="pb-2.5 font-semibold">Recipient Phone</th>
                  <th className="pb-2.5 font-semibold">Plan</th>
                  <th className="pb-2.5 font-semibold">VTU Reference</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Charged</th>
                  <th className="pb-2.5 text-right font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                {data.transactions.map((tx) => {
                  let badge = "bg-secondary text-foreground";
                  if (tx.status === "success")
                    badge = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                  else if (tx.status === "pending" || tx.status === "processing")
                    badge = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
                  else if (tx.status === "failed")
                    badge = "bg-rose-500/15 text-rose-600 dark:text-rose-400";

                  return (
                    <tr key={tx.xoraTxId} className="hover:bg-secondary/40 transition-colors">
                      <td className="py-2.5 font-semibold text-foreground">{tx.xoraTxId}</td>
                      <td className="py-2.5 text-muted-foreground truncate max-w-[100px]">
                        {tx.userId}
                      </td>
                      <td className="py-2.5 font-medium">{tx.phoneDisplay}</td>
                      <td className="py-2.5 font-sans text-xs">{tx.planName}</td>
                      <td className="py-2.5 text-muted-foreground">{tx.vtushareRef || "—"}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badge}`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-sans">₦{tx.chargedAmount || tx.expectedAmount}</td>
                      <td className="py-2.5 text-right font-sans text-[11px] text-muted-foreground">
                        {tx.createdAt
                          ? new Date(tx.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No reward transactions recorded yet. Use the Controlled Test tool above to send a
              verification transaction.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
