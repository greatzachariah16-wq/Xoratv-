import { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Eye,
  Filter,
  Flame,
  Layers,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  CombinedAnalyticsEngine,
  CombinedFraudReporter,
  FraudReporter,
  FRAUD_GUARD_CONFIG,
  getRecentEnforcementDecisions,
  resolveEnforcementDecision,
  determineEnforcementAction,
  rtdbSet,
  type EnforcementDecision,
  type EnforcementTier,
  type FlaggedDeviceSummary,
  type UnifiedAnalyticsOverview,
  type UnifiedFraudReport,
  type UnifiedSessionInput,
} from "@/lib/fraud-guard";
import { Button } from "@/components/ui/button";
import { getAdminAuthHeaders } from "@/hooks/useAdminAuth";

export function AdminFraudShieldDashboard() {
  const [activeTab, setActiveTab] = useState<"decisions" | "devices" | "multi_user">("decisions");
  const [tierFilter, setTierFilter] = useState<number | "all" | "escalated">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [analytics, setAnalytics] = useState<UnifiedAnalyticsOverview | null>(null);
  const [decisions, setDecisions] = useState<EnforcementDecision[]>([]);
  const [flaggedDevices, setFlaggedDevices] = useState<FlaggedDeviceSummary[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<EnforcementDecision | null>(null);

  // Account Devices Sharing Telemetry states
  interface AccountDeviceRecord {
    userId: string;
    email: string | null;
    devices: Array<{ deviceId: string; lastSeenAt: string }>;
    deviceCount: number;
    isRestricted: boolean;
    restrictionReason?: string;
  }

  const [accountDevicesList, setAccountDevicesList] = useState<AccountDeviceRecord[]>([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const [overviewData, recentDecisions, devicesData] = await Promise.all([
        CombinedFraudReporter.getAnalyticsOverview(200),
        getRecentEnforcementDecisions(60),
        FraudReporter.getFlaggedDevices(50),
      ]);

      setAnalytics(overviewData);
      setDecisions(recentDecisions);
      setFlaggedDevices(devicesData);
      if (isManualRefresh) {
        toast.success("Fraud Shield telemetry refreshed");
      }
    } catch (err) {
      console.error("Failed to load fraud shield telemetry", err);
      toast.error("Failed to load fraud shield data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
    if (activeTab === "multi_user") {
      void fetchAccountDevices();
    }
    const interval = setInterval(() => {
      void loadData(false);
      if (activeTab === "multi_user") {
        void fetchAccountDevices();
      }
    }, 12000); // 12-second live refresh polling
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleResolve = async (decisionId: string, action: "approved" | "confirmed_bot") => {
    try {
      const success = await resolveEnforcementDecision(
        decisionId,
        action,
        `Resolved as ${action} via Admin Fraud Shield.`,
      );
      if (success) {
        toast.success(
          `Decision marked as ${action === "approved" ? "Approved / Clear" : "Confirmed Bot"}`,
        );
        setDecisions((prev) =>
          prev.map((d) =>
            d.decisionId === decisionId
              ? {
                  ...d,
                  resolution: action,
                  resolutionNotes: `Resolved as ${action} via Admin Fraud Shield.`,
                  resolvedAt: new Date().toISOString(),
                }
              : d,
          ),
        );
        if (selectedDecision?.decisionId === decisionId) {
          setSelectedDecision((prev) =>
            prev
              ? {
                  ...prev,
                  resolution: action,
                  resolutionNotes: `Resolved as ${action} via Admin Fraud Shield.`,
                  resolvedAt: new Date().toISOString(),
                }
              : null,
          );
        }
      } else {
        toast.error("Failed to update decision in database");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error updating decision");
    }
  };

  const fetchAccountDevices = async () => {
    setIsFetchingDevices(true);
    try {
      const res = await fetch("/api/admin/fraud/account-devices", {
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setAccountDevicesList(json.records || []);
      } else {
        toast.error(json.error || "Failed to load account device mappings.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching account device sharing list";
      toast.error(msg);
    } finally {
      setIsFetchingDevices(false);
    }
  };

  const handleRestrictAccount = async (userId: string, defaultReason?: string) => {
    const reason = window.prompt(
      "Reason for restricting this account:",
      defaultReason || "Closed due to suspicious multi-device account sharing.",
    );
    if (reason === null) return; // cancelled

    try {
      const res = await fetch("/api/admin/fraud/restrict-account", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ userId, reason }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(`Account ${userId} restricted.`);
        await fetchAccountDevices();
      } else {
        toast.error(json.error || "Failed to restrict account.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error restricting account.");
    }
  };

  const handleUnrestrictAccount = async (userId: string) => {
    if (!window.confirm(`Are you sure you want to unrestrict account: ${userId}?`)) return;

    try {
      const res = await fetch("/api/admin/fraud/unrestrict-account", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(`Account ${userId} unrestricted.`);
        await fetchAccountDevices();
      } else {
        toast.error(json.error || "Failed to unrestrict account.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error unrestricting account.");
    }
  };

  const handleNotifyUser = async (userId: string) => {
    const defaultMsg =
      "Multiple device fingerprints have accessed your account today. Please verify your active devices to prevent session termination or account restriction.";
    const message = window.prompt(
      "Enter warning notification message to push to this user's notification feed:",
      defaultMsg,
    );
    if (!message) return;

    try {
      const res = await fetch("/api/admin/fraud/notify-user", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ userId, message }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(`Warning notification pushed to user ${userId}.`);
      } else {
        toast.error(json.error || "Failed to send warning.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error sending warning.");
    }
  };

  const filteredDecisions = decisions.filter((d) => {
    if (tierFilter === "escalated") {
      if (!d.escalateToAccountSuspension && d.tier3Count7Days < 3) return false;
    } else if (tierFilter !== "all") {
      if (d.tier !== tierFilter) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.accountId.toLowerCase().includes(q) ||
      d.deviceFingerprintId.toLowerCase().includes(q) ||
      d.clientIp.toLowerCase().includes(q) ||
      d.reason.toLowerCase().includes(q)
    );
  });

  const getTierBadge = (tier: EnforcementTier) => {
    switch (tier) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
            <CheckCircle2 className="size-3" /> Tier 0 — Clear
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400">
            <Eye className="size-3" /> Tier 1 — Observe
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
            <Clock className="size-3" /> Tier 2 — Soft Friction
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
            <ShieldAlert className="size-3" /> Tier 3 — Hard Restriction
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-400";
    if (score >= 45) return "text-blue-400";
    if (score >= 25) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <section
      id="fraud-guard"
      className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 shadow-card sm:p-7"
    >
      {/* Top Banner Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Shield className="size-3.5 text-primary" />
            Full-Stack Fraud & Bot Protection
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
            Fraud Shield & Enforcement Queue
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
            Real-time bot telemetry, hardware collision tracking, and automated 4-tier enforcement
            decisions with 14-day decay and 7-day escalation rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="h-9 gap-1.5 rounded-xl border-border bg-surface px-3 text-xs"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setActiveTab("simulator")}
            className="h-9 gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm"
          >
            <Play className="size-3.5" />
            Open Simulator
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Decisions */}
        <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Enforcement Decisions</span>
            <Activity className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
              {decisions.length}
            </span>
            <span className="text-[11px] text-muted-foreground">in RTDB queue</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Radio className="size-2 text-emerald-400 animate-pulse" /> Live logging enabled
          </div>
        </div>

        {/* Avg Trust Score */}
        <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Avg Composite Trust</span>
            <ShieldCheck className="size-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-display text-2xl font-bold tabular-nums sm:text-3xl ${getScoreColor(
                analytics?.averageTrustScore ?? 100,
              )}`}
            >
              {analytics?.averageTrustScore ?? 100}
              <span className="text-xs text-muted-foreground font-normal">/100</span>
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Calibrated across {analytics?.totalAssessments ?? 0} sessions
          </div>
        </div>

        {/* Flagged Multi-Account Hardware */}
        <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Multi-Account Collisions</span>
            <Cpu className="size-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-amber-400 sm:text-3xl">
              {flaggedDevices.length}
            </span>
            <span className="text-[11px] text-muted-foreground">hardware fingerprints</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            3+ accounts tied to single device
          </div>
        </div>

        {/* Severe Automation Bots */}
        <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Tier 3 Hard Restrictions</span>
            <Bot className="size-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-rose-400 sm:text-3xl">
              {decisions.filter((d) => d.tier === 3).length}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({decisions.filter((d) => d.escalateToAccountSuspension).length} escalated)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Webdriver / Headless / Time-warp
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("decisions")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 transition-all ${
              activeTab === "decisions"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" />
            Enforcement Decisions ({decisions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("devices")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 transition-all ${
              activeTab === "devices"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cpu className="size-3.5" />
            Flagged Devices ({flaggedDevices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("multi_user")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 transition-all ${
              activeTab === "multi_user"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="size-3.5" />
            Account Sharing Tracker
          </button>
        </div>

        {activeTab === "decisions" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search account, IP, device..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8.5 w-48 rounded-xl border border-border bg-surface pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-64"
              />
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => setTierFilter("all")}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTierFilter(3)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === 3 ? "bg-rose-500 text-white" : "text-muted-foreground"
                }`}
              >
                Tier 3
              </button>
              <button
                type="button"
                onClick={() => setTierFilter(2)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === 2 ? "bg-amber-500 text-white" : "text-muted-foreground"
                }`}
              >
                Tier 2
              </button>
              <button
                type="button"
                onClick={() => setTierFilter(1)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === 1 ? "bg-blue-500 text-white" : "text-muted-foreground"
                }`}
              >
                Tier 1
              </button>
              <button
                type="button"
                onClick={() => setTierFilter(0)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === 0 ? "bg-emerald-500 text-white" : "text-muted-foreground"
                }`}
              >
                Tier 0
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("escalated")}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  tierFilter === "escalated" ? "bg-purple-600 text-white" : "text-muted-foreground"
                }`}
              >
                Escalations
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Enforcement Decisions Feed */}
      {activeTab === "decisions" && (
        <div className="mt-4">
          {isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="size-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading decision stream...</span>
              </div>
            </div>
          ) : filteredDecisions.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-8 text-center">
              <ShieldCheck className="size-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-display text-base font-semibold">
                No enforcement decisions match filter
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Run a session test in the Ruleset Simulator tab to generate live telemetry and
                observe decision tiers in real time.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setActiveTab("simulator")}
                className="mt-4 h-8.5 rounded-xl bg-primary px-3 text-xs"
              >
                Go to Simulator
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDecisions.map((decision) => (
                <div
                  key={decision.decisionId}
                  className="group rounded-2xl border border-border/80 bg-surface/40 p-4 transition-all hover:border-primary/40 hover:bg-surface/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTierBadge(decision.tier)}

                        {decision.isHardOverride && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
                            <Flame className="size-2.5" /> Hard Override
                          </span>
                        )}

                        {decision.deviceSharingExceptionApplied && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                            <Cpu className="size-2.5" /> Device Sharing Exception
                          </span>
                        )}

                        {decision.escalateToAccountSuspension && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-bold text-purple-300 animate-pulse">
                            <AlertOctagon className="size-2.5" /> 3+ Tier 3 in 7 Days: Escalated
                          </span>
                        )}

                        {decision.resolution && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              decision.resolution === "approved"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {decision.resolution === "approved" ? "Admin Cleared" : "Confirmed Bot"}
                          </span>
                        )}

                        <span className="text-[11px] text-muted-foreground">
                          {new Date(decision.epochMs).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Account & Device Identifiers */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Account:{" "}
                          <strong className="font-mono text-foreground">
                            {decision.accountId}
                          </strong>
                        </span>
                        <span>
                          Device:{" "}
                          <strong className="font-mono text-foreground">
                            {decision.deviceFingerprintId.slice(0, 16)}...
                          </strong>
                        </span>
                        <span>
                          IP: <span className="font-mono">{decision.clientIp}</span>
                        </span>
                        <span>
                          Trust Score:{" "}
                          <strong className={getScoreColor(decision.trustScore)}>
                            {decision.trustScore}/100
                          </strong>
                        </span>
                        <span>
                          User UI Status:{" "}
                          <strong className="font-semibold text-foreground">
                            {decision.userFacingStatus}
                          </strong>
                        </span>
                      </div>

                      {/* Reason Description */}
                      <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                        {decision.reason}
                      </p>

                      {/* Hard override or active signal tags */}
                      {decision.hardOverrideSignals?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {decision.hardOverrideSignals.map((sig) => (
                            <span
                              key={sig}
                              className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-0.5 text-[10px] font-mono text-rose-300"
                            >
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Admin Actions */}
                    <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDecision(decision)}
                        className="h-8 rounded-xl border-border bg-surface px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3.5 mr-1" />
                        Inspect
                      </Button>

                      {decision.tier >= 2 && !decision.resolution && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleResolve(decision.decisionId, "approved")}
                            className="h-8 rounded-xl border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                          >
                            <CheckCircle2 className="size-3.5 mr-1" />
                            Clear Flag
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleResolve(decision.decisionId, "confirmed_bot")}
                            className="h-8 rounded-xl border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                          >
                            <XCircle className="size-3.5 mr-1" />
                            Confirm Bot
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Flagged Hardware Devices */}
      {activeTab === "devices" && (
        <div className="mt-4">
          {flaggedDevices.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-8 text-center">
              <Cpu className="size-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-display text-base font-semibold">
                No Multi-Account Collisions Detected
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Devices with 3 or more registered accounts sharing the identical hardware
                fingerprint will be automatically flagged here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedDevices.map((device) => (
                <div
                  key={device.deviceFingerprintId}
                  className="rounded-2xl border border-border/80 bg-surface/40 p-4 transition-all"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">
                          {device.deviceFingerprintId}
                        </span>
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
                          {device.distinctAccountsCount} Accounts Linked
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Total Sessions: <strong>{device.totalSessions}</strong>
                        </span>
                        <span>
                          Last Seen: <strong>{new Date(device.lastSeenAt).toLocaleString()}</strong>
                        </span>
                      </div>

                      {/* Linked Accounts Pills */}
                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Linked Account IDs:
                        </span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {device.distinctAccounts.map((acc) => (
                            <span
                              key={acc}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-foreground"
                            >
                              {acc}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Account Devices daily sharing tracker & closed action triggers */}
      {activeTab === "multi_user" && (
        <div className="mt-4 space-y-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-primary">
              Daily Multi-Device Login Sharing Tracker
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Real-time monitoring of accounts active on multiple separate devices today. This
              identifies farming/sharing abuse where one user runs parallel browsers or distributes
              their credentials to multiple people.
            </p>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Showing {accountDevicesList.length} accounts checking in today
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchAccountDevices()}
                disabled={isFetchingDevices}
                className="rounded-xl h-8 text-xs font-semibold"
              >
                {isFetchingDevices ? (
                  <>
                    <RefreshCw className="mr-1.5 size-3 animate-spin" />
                    Fetching sharing lists...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1.5 size-3" />
                    Reload Sharing Telemetry
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {accountDevicesList.length > 0 ? (
              accountDevicesList.map((rec) => {
                const isHighlySuspicious = rec.deviceCount >= 2;
                return (
                  <div
                    key={rec.userId}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3 flex flex-col justify-between ${
                      rec.isRestricted
                        ? "border-rose-500/20 bg-rose-500/5"
                        : isHighlySuspicious
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-border bg-card"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-sm text-foreground">
                              {rec.email || rec.userId}
                            </span>
                            {rec.isRestricted && (
                              <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold text-rose-600 uppercase">
                                Restricted
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground block mt-0.5">
                            ID: {rec.userId}
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              rec.deviceCount >= 3
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : rec.deviceCount === 2
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {rec.deviceCount} Device{rec.deviceCount > 1 ? "s" : ""} Today
                          </span>
                        </div>
                      </div>

                      {rec.isRestricted && rec.restrictionReason && (
                        <div className="mt-2 rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-800 dark:text-rose-200">
                          <span className="font-bold">Restriction Reason:</span>{" "}
                          {rec.restrictionReason}
                        </div>
                      )}

                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-muted-foreground block border-b border-border/40 pb-1">
                          Connected Hardware Fingerprints today:
                        </span>
                        <div className="mt-1.5 space-y-1.5">
                          {rec.devices.map((dev) => (
                            <div
                              key={dev.deviceId}
                              className="flex items-center justify-between text-[11px] font-mono bg-background px-2.5 py-1 rounded-lg border border-border/40"
                            >
                              <span className="text-foreground truncate max-w-[150px]">
                                {dev.deviceId}
                              </span>
                              <span className="text-muted-foreground text-[10px]">
                                Last active:{" "}
                                {new Date(dev.lastSeenAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-border/40">
                      {rec.isRestricted ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnrestrictAccount(rec.userId)}
                          className="flex-1 rounded-xl h-8.5 text-xs font-semibold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                        >
                          Unrestrict Account
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleNotifyUser(rec.userId)}
                            className="flex-1 rounded-xl h-8.5 text-xs font-semibold border-amber-500/20 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                          >
                            Notify User
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleRestrictAccount(rec.userId)}
                            className="flex-1 rounded-xl h-8.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            Close Account
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 py-16 text-center rounded-3xl border border-dashed border-border bg-background/50">
                <CheckCircle2 className="mx-auto size-8 text-emerald-500/80" />
                <h4 className="mt-3 font-display font-semibold text-sm text-foreground">
                  Perfect Isolation
                </h4>
                <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  No account sharing or multi-device login collusions observed today. All accounts
                  are currently mapped 1:1 with device profiles.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Telemetry Inspection Modal / Slide-out */}
      {selectedDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-lift">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">
                    Enforcement Telemetry Inspector
                  </h3>
                  {getTierBadge(selectedDecision.tier)}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  Decision ID: {selectedDecision.decisionId}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDecision(null)}
                className="size-8 rounded-full p-0"
              >
                ✕
              </Button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3">
                <div>
                  <span className="text-muted-foreground">Account ID:</span>
                  <div className="font-mono font-semibold">{selectedDecision.accountId}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Client IP:</span>
                  <div className="font-mono font-semibold">{selectedDecision.clientIp}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Device Fingerprint:</span>
                  <div className="break-all font-mono text-[11px] font-semibold">
                    {selectedDecision.deviceFingerprintId}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Assessed At:</span>
                  <div>{new Date(selectedDecision.epochMs).toLocaleString()}</div>
                </div>
              </div>

              <div>
                <span className="font-semibold text-muted-foreground">Decision Rationale:</span>
                <p className="mt-1 rounded-xl border border-border bg-surface p-3 text-foreground">
                  {selectedDecision.reason}
                </p>
              </div>

              {selectedDecision.activeSignals && selectedDecision.activeSignals.length > 0 && (
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Active Telemetry Signals ({selectedDecision.activeSignals.length}):
                  </span>
                  <div className="mt-2 space-y-2">
                    {selectedDecision.activeSignals.map((sig, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between rounded-xl border border-border bg-surface p-2.5 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-primary">{sig.type}</span>
                          <p className="mt-0.5 text-muted-foreground">{sig.reason}</p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            sig.severity === "critical"
                              ? "bg-rose-500/20 text-rose-300"
                              : sig.severity === "high"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-blue-500/20 text-blue-300"
                          }`}
                        >
                          {sig.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDecision(null)}
                  className="rounded-xl"
                >
                  Close
                </Button>
                {selectedDecision.tier >= 2 && !selectedDecision.resolution && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        void handleResolve(selectedDecision.decisionId, "approved");
                      }}
                      className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Clear Flag / Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        void handleResolve(selectedDecision.decisionId, "confirmed_bot");
                      }}
                      className="rounded-xl bg-rose-600 text-white hover:bg-rose-500"
                    >
                      Confirm Bot
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
