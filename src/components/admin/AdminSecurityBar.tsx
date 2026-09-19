import { useState, useEffect } from "react";
import {
  ShieldCheck,
  History,
  KeyRound,
  LogOut,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import type { AdminSessionInfo } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";

interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  ip: string;
  userAgent?: string;
  details: string;
}

interface AdminSecurityBarProps {
  sessionInfo: AdminSessionInfo | null;
  onLogout: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
}

export function AdminSecurityBar({
  sessionInfo,
  onLogout,
  onRefreshSession,
}: AdminSecurityBarProps) {
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [logs, setLogs] = useState<SecurityAuditEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Rotate Form
  const [newPhrase1, setNewPhrase1] = useState("");
  const [newPhrase2, setNewPhrase2] = useState("");
  const [newPhrase3, setNewPhrase3] = useState("");
  const [newPhrase4, setNewPhrase4] = useState("");
  const [newMfaCode, setNewMfaCode] = useState("");
  const [isRotating, setIsRotating] = useState(false);

  // Remaining session seconds
  const [timeLeft, setTimeLeft] = useState<number>(7200);

  useEffect(() => {
    if (!sessionInfo?.expiresAt) return;
    const calcTime = () => {
      const remaining = Math.max(0, Math.floor((sessionInfo.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    calcTime();
    const interval = setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, [sessionInfo]);

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours > 0 ? `${hours}h ` : ""}${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/admin/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        toast.error("Failed to load audit logs");
      }
    } catch {
      toast.error("Error retrieving audit records");
    } finally {
      setLoadingLogs(false);
    }
  };

  const openAuditModal = () => {
    setShowAuditModal(true);
    fetchAuditLogs();
  };

  const handleRotateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhrase1 || !newPhrase2 || !newPhrase3 || !newPhrase4) {
      toast.error("All 4 phrases are required for rotation");
      return;
    }

    setIsRotating(true);
    try {
      const res = await fetch("/api/admin/rotate-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPhrase1,
          newPhrase2,
          newPhrase3,
          newPhrase4,
          newMfaCode: newMfaCode || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Security credentials rotated in server environment!");
        setShowRotateModal(false);
        setNewPhrase1("");
        setNewPhrase2("");
        setNewPhrase3("");
        setNewPhrase4("");
        setNewMfaCode("");
      } else {
        toast.error(data.error || "Failed to rotate credentials");
      }
    } catch {
      toast.error("Error communicating with server");
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/25 bg-success/8 p-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-success">
                Admin session active
              </span>
              <span className="hidden items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success sm:inline-flex">
                Protected
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Session expires in{" "}
              <span className="font-mono text-foreground font-medium">
                {formatCountdown(timeLeft)}
              </span>{" "}
              · 30m idle timeout active
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAuditModal}
            className="rounded-xl bg-surface shadow-none"
            title="View security events and audit records"
          >
            <History className="h-3.5 w-3.5 text-primary" />
            <span>Audit Logs</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRotateModal(true)}
            className="rounded-xl bg-surface shadow-none"
            title="Rotate server access phrases"
          >
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            <span>Rotate Secrets</span>
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onLogout}
            className="rounded-xl shadow-none"
            title="Invalidate session and clear HTTP-only cookie"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Lock & Sign Out</span>
          </Button>
        </div>
      </div>

      {/* Security Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-semibold">Security Audit Trail</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  disabled={loadingLogs}
                  className="press rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="press rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {loadingLogs ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Fetching security telemetry...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No security audit events recorded yet.
                </div>
              ) : (
                logs.map((log) => {
                  const isSuccess = log.eventType === "LOGIN_SUCCESS";
                  const isFailed =
                    log.eventType === "LOGIN_FAILED" || log.eventType === "MFA_FAILED";
                  const isLockout = log.eventType === "LOCKOUT_TRIGGERED";

                  return (
                    <div
                      key={log.id}
                      className="flex flex-col gap-1 rounded-xl border border-border bg-background/50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-semibold text-[11px] ${
                            isSuccess
                              ? "text-emerald-400"
                              : isLockout
                                ? "text-destructive font-bold"
                                : isFailed
                                  ? "text-amber-400"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {isSuccess && <CheckCircle2 className="h-3 w-3" />}
                          {isLockout && <AlertTriangle className="h-3 w-3" />}
                          {log.eventType}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(log.timestamp).toLocaleTimeString()} · IP: {log.ip}
                        </span>
                      </div>
                      <p className="text-foreground">{log.details}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-border p-3 text-right">
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="press rounded-xl bg-secondary px-4 py-2 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credential Rotation Modal */}
      {showRotateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-400" />
                <h3 className="font-display text-base font-semibold">Rotate Sovereign Secrets</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRotateModal(false)}
                className="press rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRotateSubmit} className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Update the server-side private admin phrases without modifying client code or
                redeploying the frontend.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  New Phrase 1
                </label>
                <input
                  type="password"
                  value={newPhrase1}
                  onChange={(e) => setNewPhrase1(e.target.value)}
                  placeholder="New Phrase 1..."
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  New Phrase 2
                </label>
                <input
                  type="password"
                  value={newPhrase2}
                  onChange={(e) => setNewPhrase2(e.target.value)}
                  placeholder="New Phrase 2..."
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  New Phrase 3
                </label>
                <input
                  type="password"
                  value={newPhrase3}
                  onChange={(e) => setNewPhrase3(e.target.value)}
                  placeholder="New Phrase 3..."
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  New Phrase 4
                </label>
                <input
                  type="password"
                  value={newPhrase4}
                  onChange={(e) => setNewPhrase4(e.target.value)}
                  placeholder="New Phrase 4..."
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  New 6-Digit Master MFA Code (Optional)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newMfaCode}
                  onChange={(e) => setNewMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Keep current or enter 6-digit code..."
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRotateModal(false)}
                  className="press rounded-xl border border-border px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRotating}
                  className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{isRotating ? "Rotating Secrets..." : "Commit Credential Rotation"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
