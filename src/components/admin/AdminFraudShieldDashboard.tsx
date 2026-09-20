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

export function AdminFraudShieldDashboard() {
  const [activeTab, setActiveTab] = useState<"decisions" | "devices" | "simulator">("decisions");
  const [tierFilter, setTierFilter] = useState<number | "all" | "escalated">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [analytics, setAnalytics] = useState<UnifiedAnalyticsOverview | null>(null);
  const [decisions, setDecisions] = useState<EnforcementDecision[]>([]);
  const [flaggedDevices, setFlaggedDevices] = useState<FlaggedDeviceSummary[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<EnforcementDecision | null>(null);

  // Simulator state
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<{
    report: UnifiedFraudReport;
    decision: EnforcementDecision;
  } | null>(null);

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
    const interval = setInterval(() => {
      void loadData(false);
    }, 12000); // 12-second live refresh polling
    return () => clearInterval(interval);
  }, []);

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

  // Run a diagnostic simulation session
  const runSimulation = async (
    type: "clean" | "webdriver_bot" | "device_sharing" | "speed_hacker",
  ) => {
    setSimRunning(true);
    try {
      const fakeAccountId = `sim_acc_${Math.random().toString(36).slice(2, 7)}`;
      const fakeDeviceId =
        type === "device_sharing"
          ? "fp_shared_device_household_99"
          : `fp_sim_${Math.random().toString(36).slice(2, 7)}`;
      const fakeIp = type === "webdriver_bot" ? "198.51.100.42" : "72.14.201.2";

      let heartbeatPayload: UnifiedSessionInput["heartbeat"] = undefined;
      if (type === "speed_hacker") {
        const sessionId = `hb_sim_${Date.now()}`;
        const nonce = `nonce_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        // Seed a valid nonce issued 15s ago with 0 last playback into RTDB
        const noncePath = `${FRAUD_GUARD_CONFIG.rtdbPaths.heartbeatNonces}/${sessionId}/${nonce}`;
        await rtdbSet(noncePath, {
          nonce,
          sessionId,
          accountId: fakeAccountId,
          deviceFingerprintId: fakeDeviceId,
          issuedAt: now - 15000,
          expiresAt: now + 300000,
          lastPlaybackSeconds: 0,
          lastHeartbeatWallClock: now - 15000,
          used: false,
        });

        heartbeatPayload = {
          sessionId,
          nonce,
          currentPlaybackSeconds: 300, // 300s media progressed in 15s real elapsed time = 20x speed hack!
          claimedDeltaSeconds: 300,
        };
      }

      // Build simulated telemetry conforming directly to UnifiedSessionInput
      const simulatedInput: UnifiedSessionInput = {
        accountId: fakeAccountId,
        email: `${fakeAccountId}@example.test`,
        clientIp: fakeIp,
        deviceFingerprint: {
          fingerprintId: fakeDeviceId,
          hardware: {
            platform: type === "clean" ? "iPhone" : "MacIntel",
            screenResolution: "1920x1080",
            hardwareConcurrency: type === "webdriver_bot" ? 2 : 8,
            timezone: "America/New_York",
            maxTouchPoints: type === "clean" ? 5 : 0,
          },
          webgl: {
            renderer: type === "webdriver_bot" ? "Google SwiftShader (Headless)" : "Apple M2 Max",
            unmaskedRenderer: type === "webdriver_bot" ? "Google Inc. (Google)" : "Apple",
            isHeadlessGpu: type === "webdriver_bot",
          },
          environment: {
            webdriver: type === "webdriver_bot",
            phantomJs: false,
            nightmareJs: false,
            selenium: type === "webdriver_bot",
            domAutomation: false,
          },
        },
        telemetry: {
          scrollCount: type === "webdriver_bot" ? 0 : 25,
          scrollVelocityVariance: type === "webdriver_bot" ? 0 : 0.65,
          hasHumanScrollCurves: type !== "webdriver_bot",
          touchCount: type === "clean" ? 18 : 0,
          averageTouchRadius: type === "clean" ? 12 : 0,
          touchPressureVariance: type === "clean" ? 0.35 : 0,
          hasHumanTouchJitter: type === "clean",
          mouseMoveCount: type === "clean" ? 0 : 40,
          mouseTrajectoryCurvature: type === "clean" ? 0 : 1.2,
          activeForegroundSeconds: type === "webdriver_bot" ? 1 : 65,
          backgroundSeconds: type === "webdriver_bot" ? 64 : 2,
          rapidClickBurstCount: 0,
          totalInteractionEvents: type === "webdriver_bot" ? 0 : 43,
        },
        heartbeat: heartbeatPayload,
      };

      // 1. Evaluate unified session
      const report = await CombinedAnalyticsEngine.evaluateUnifiedSession(simulatedInput);

      // If device_sharing scenario, force collision signal to demonstrate the exception rule
      if (type === "device_sharing") {
        report.serverSideSignals.isMultiAccountAbuse = true;
        report.serverSideSignals.deviceCollisionCount = 4;
        report.trustScore = 22; // Would be Tier 3 normally (<25)
        report.allSignals = [
          {
            type: "MULTI_ACCOUNT_DEVICE_COLLISION",
            source: "server",
            severity: "high",
            confidence: 0.9,
            weight: 35,
            reason: "Device collision: 4 accounts observed on physical fingerprint.",
            detectedAt: new Date().toISOString(),
          },
        ];
      }

      // 2. Determine enforcement action & log to Firebase RTDB
      const decision = await determineEnforcementAction(report);

      setSimResult({ report, decision });
      toast.success(
        `Simulation completed: ${decision.tierName} (${decision.trustScore}/100 Trust)`,
      );

      // Refresh recent decisions
      await loadData(false);
    } catch (err) {
      console.error("Simulation error", err);
      toast.error(
        err instanceof Error ? `Simulation error: ${err.message}` : "Failed to run simulation",
      );
    } finally {
      setSimRunning(false);
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
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 transition-all ${
              activeTab === "simulator"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Play className="size-3.5" />
            Ruleset Simulator
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

      {/* Tab 3: Simulator & Diagnostic Sandbox */}
      {activeTab === "simulator" && (
        <div className="mt-4 space-y-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-primary">
              1-Click Ruleset Diagnostic Sandbox
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Execute test sessions directly through the client-server pipeline to verify that
              hard-overrides, score tiers, device-sharing exceptions, and escalation counters
              trigger accurately.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Scenario 1: Clean User */}
              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="size-4" /> Clean Mobile User
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Natural touch jitter, balanced scroll deceleration, no automation flags.
                  </p>
                  <span className="mt-2 block text-[10px] font-medium text-emerald-500">
                    Expected: Tier 0 — Clear (~95 Score)
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={simRunning}
                  onClick={() => runSimulation("clean")}
                  className="mt-3 h-8 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >
                  Test Clean User
                </Button>
              </div>

              {/* Scenario 2: Webdriver Bot */}
              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                    <Bot className="size-4" /> Webdriver / Headless
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    `navigator.webdriver === true` and Google SwiftShader renderer detected.
                  </p>
                  <span className="mt-2 block text-[10px] font-medium text-rose-400">
                    Expected: Tier 3 Hard Override
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={simRunning}
                  onClick={() => runSimulation("webdriver_bot")}
                  className="mt-3 h-8 w-full rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                >
                  Test Bot Override
                </Button>
              </div>

              {/* Scenario 3: Device Sharing Household */}
              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                    <Cpu className="size-4" /> Shared Family Device
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    4 accounts on 1 iPad, but clean human touches and zero speed hacks.
                  </p>
                  <span className="mt-2 block text-[10px] font-medium text-cyan-400">
                    Expected: Capped at Tier 2 (Exception)
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={simRunning}
                  onClick={() => runSimulation("device_sharing")}
                  className="mt-3 h-8 w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white"
                >
                  Test Device Sharing
                </Button>
              </div>

              {/* Scenario 4: Heartbeat Speed Hacker */}
              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                    <Flame className="size-4" /> Heartbeat Speed Hack
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Claims 300 seconds of watch delta in 15 seconds of real wall-clock time.
                  </p>
                  <span className="mt-2 block text-[10px] font-medium text-purple-400">
                    Expected: Tier 3 Hard Override
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={simRunning}
                  onClick={() => runSimulation("speed_hacker")}
                  className="mt-3 h-8 w-full rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white"
                >
                  Test Speed Hacker
                </Button>
              </div>
            </div>
          </div>

          {/* Simulation Output Card */}
          {simResult && (
            <div className="rounded-2xl border border-border bg-surface/50 p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Latest Simulator Result
                  </span>
                  {getTierBadge(simResult.decision.tier)}
                </div>
                <span className="text-xs text-muted-foreground">
                  Decision ID:{" "}
                  <strong className="font-mono">{simResult.decision.decisionId}</strong>
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Trust Score:</span>{" "}
                    <strong className={getScoreColor(simResult.decision.trustScore)}>
                      {simResult.decision.trustScore}/100
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Action Type:</span>{" "}
                    <span className="font-mono font-semibold">{simResult.decision.action}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User-Facing Status:</span>{" "}
                    <span className="font-semibold">{simResult.decision.userFacingStatus}</span>{" "}
                    {simResult.decision.userFacingMessage && (
                      <span className="text-muted-foreground">
                        ("{simResult.decision.userFacingMessage}")
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hard Override:</span>{" "}
                    <span className="font-semibold">
                      {simResult.decision.isHardOverride ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Device-Sharing Exception:</span>{" "}
                    <span className="font-semibold">
                      {simResult.decision.deviceSharingExceptionApplied
                        ? "Applied (Capped at Tier 2)"
                        : "None"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">7-Day Tier 3 Counter:</span>{" "}
                    <strong className="font-mono">{simResult.decision.tier3Count7Days}</strong>{" "}
                    {simResult.decision.escalateToAccountSuspension && (
                      <span className="text-rose-400 font-bold">
                        (Escalated to Suspension Review)
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-3 text-xs">
                  <span className="font-semibold text-muted-foreground">Reason & Diagnostics:</span>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">
                    {simResult.decision.reason}
                  </p>
                  {simResult.decision.hardOverrideSignals.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[11px] font-semibold text-rose-400">
                        Triggered Signals:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {simResult.decision.hardOverrideSignals.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
