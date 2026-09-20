import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Fingerprint,
  Layers,
  MousePointer,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import {
  assessFraudRisk,
  generateDeviceFingerprint,
  getStoredDeviceLinks,
  telemetryCollector,
  type DeviceFingerprint,
  type FraudAssessment,
} from "@/lib/fraud";
import { useAuth } from "@/hooks/useAuth";

export function FraudDetectionInspector() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fingerprint, setFingerprint] = useState<DeviceFingerprint | null>(null);
  const [assessment, setAssessment] = useState<FraudAssessment | null>(null);
  const [deviceLinks, setDeviceLinks] = useState(getStoredDeviceLinks());
  const [testEmail, setTestEmail] = useState("");

  const runDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      const fp = await generateDeviceFingerprint();
      setFingerprint(fp);

      const assess = await assessFraudRisk({
        currentAccountId: user?.id || "guest_viewer",
        currentEmail: user?.email || null,
        cachedFingerprint: fp,
      });
      setAssessment(assess);
      setDeviceLinks(getStoredDeviceLinks());
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  // Start telemetry listening when component mounts
  useEffect(() => {
    telemetryCollector.start();
    void runDiagnostic();
  }, [runDiagnostic]);

  const handleSimulateMultiAccount = async () => {
    if (!fingerprint) return;
    const dummyId = `acc_${Math.random().toString(36).slice(2, 8)}`;
    const emailToUse =
      testEmail.trim() || `farmer_${Math.floor(Math.random() * 900 + 100)}@test.com`;

    const assess = await assessFraudRisk({
      currentAccountId: dummyId,
      currentEmail: emailToUse,
      cachedFingerprint: fingerprint,
    });
    setAssessment(assess);
    setDeviceLinks(getStoredDeviceLinks());
    setTestEmail("");
  };

  const handleClearHistory = () => {
    try {
      localStorage.removeItem("xora_fraud_device_links");
      setDeviceLinks([]);
      void runDiagnostic();
    } catch {
      // ignore
    }
  };

  const trustColor = !assessment
    ? "text-muted-foreground"
    : assessment.trustScore >= 75
      ? "text-success border-success/30 bg-success/10"
      : assessment.trustScore >= 50
        ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
        : "text-rose-500 border-rose-500/30 bg-rose-500/10";

  return (
    <section
      id="antifraud"
      className="scroll-mt-6 rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Shield className="size-3.5" />
            Anti-Fraud & Behavioral Telemetry Core
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Device Fingerprint & Bot Detector
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Non-intrusive hardware fingerprinting, interaction entropy analysis, and multi-account
            collision detection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runDiagnostic}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Re-Assess Device
          </button>
        </div>
      </div>

      {/* Main Score & Risk Overview */}
      {assessment && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-4 ${trustColor}`}>
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Composite Trust Score
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold">{assessment.trustScore}</span>
              <span className="text-xs font-medium">/ 100</span>
            </div>
            <span className="mt-1 block text-[11px] opacity-80">
              {assessment.trustScore >= 75
                ? "Verified Human Activity"
                : assessment.trustScore >= 50
                  ? "Elevated Risk — Flagged"
                  : "Confirmed Automation / Farm"}
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk Classification
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-2xl font-bold capitalize">
                {assessment.riskLevel}
              </span>
              {assessment.riskLevel === "low" ? (
                <ShieldCheck className="size-5 text-success" />
              ) : assessment.riskLevel === "medium" ? (
                <AlertTriangle className="size-5 text-amber-500" />
              ) : (
                <ShieldAlert className="size-5 text-rose-500" />
              )}
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Reward Eligibility:{" "}
              <strong
                className={assessment.isEligibleForRewards ? "text-success" : "text-rose-500"}
              >
                {assessment.isEligibleForRewards ? "Authorized" : "Blocked"}
              </strong>
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hardware Device ID
            </span>
            <div
              className="mt-1 font-mono text-xs font-bold text-primary truncate"
              title={assessment.deviceFingerprintId}
            >
              {assessment.deviceFingerprintId}
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground truncate">
              GPU: {assessment.deviceSummary.gpuRenderer}
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Multi-Account Collisions
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-2xl font-bold">
                {deviceLinks.filter((l) => l.deviceId === assessment.deviceFingerprintId).length}
              </span>
              <Users className="size-4 text-muted-foreground" />
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Accounts on this physical device
            </span>
          </div>
        </div>
      )}

      {/* Anomaly Signals */}
      {assessment && assessment.signals.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
            <AlertTriangle className="size-4" /> Detected Anomaly Signals (
            {assessment.signals.length})
          </h3>
          <div className="mt-3 space-y-2">
            {assessment.signals.map((sig, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-xl border border-border bg-card p-3 text-xs"
              >
                <div>
                  <span className="font-mono text-[10px] font-bold text-rose-500 uppercase mr-2">
                    [-{sig.penaltyPoints} pts]
                  </span>
                  <strong className="text-foreground font-semibold">{sig.type}</strong>
                  <p className="mt-0.5 text-muted-foreground text-[11px]">{sig.description}</p>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase bg-secondary text-muted-foreground">
                  {sig.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostics Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Interaction Telemetry */}
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
            <Activity className="size-4 text-primary" /> Live Interaction Telemetry
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Scroll or touch the page to generate live interaction entropy samples.
          </p>

          {assessment && (
            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div className="rounded-xl border border-border/80 bg-card p-3">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Scroll Samples
                </span>
                <strong className="text-sm font-semibold block mt-0.5">
                  {assessment.telemetrySummary.scrollCount}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  Variance: {assessment.telemetrySummary.scrollVelocityVariance}
                </span>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Touch Events
                </span>
                <strong className="text-sm font-semibold block mt-0.5">
                  {assessment.telemetrySummary.touchCount}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  Avg Radius: {assessment.telemetrySummary.averageTouchRadius}px
                </span>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Cursor Curvature
                </span>
                <strong className="text-sm font-semibold block mt-0.5">
                  {assessment.telemetrySummary.mouseTrajectoryCurvature}
                </strong>
                <span className="text-[10px] text-muted-foreground">Deviation factor</span>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Foreground vs Background
                </span>
                <strong className="text-sm font-semibold block mt-0.5">
                  {assessment.telemetrySummary.activeForegroundSeconds}s /{" "}
                  {assessment.telemetrySummary.backgroundSeconds}s
                </strong>
                <span className="text-[10px] text-muted-foreground">Visibility ratio</span>
              </div>
            </div>
          )}
        </div>

        {/* Multi-Account Test Simulator */}
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
            <Users className="size-4 text-primary" /> Multi-Account Farming Simulator
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Test how the detector catches someone using multiple accounts or different emails on the
            same hardware.
          </p>

          <div className="flex gap-2 pt-1">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter different email address..."
              className="flex-1 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={handleSimulateMultiAccount}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Simulate Login
            </button>
          </div>

          <div className="mt-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border pb-1">
              <span>Account ID</span>
              <span>Linked Email</span>
              <span>Sessions</span>
            </div>
            <div className="max-h-32 overflow-y-auto divide-y divide-border/60">
              {deviceLinks.map((link, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 text-[11px]">
                  <span className="font-mono text-[10px] font-semibold text-primary">
                    {link.accountId}
                  </span>
                  <span className="text-foreground truncate max-w-[140px]">
                    {link.email || "No email"}
                  </span>
                  <span className="text-muted-foreground font-mono">{link.sessionCount}</span>
                </div>
              ))}
              {deviceLinks.length === 0 && (
                <p className="py-3 text-center text-muted-foreground text-[11px]">
                  No accounts linked to this device yet.
                </p>
              )}
            </div>
            {deviceLinks.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="mt-2 text-[10px] text-rose-500 hover:underline"
              >
                Clear Simulator History
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
