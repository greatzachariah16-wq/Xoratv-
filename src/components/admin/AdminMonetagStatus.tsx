import { useEffect, useState, useCallback } from "react";
import { getMonetagStatus, type MonetagDiagnostics } from "@/lib/monetag";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  ShieldCheck,
  Globe,
  Radio,
} from "lucide-react";

export function AdminMonetagStatus() {
  const [status, setStatus] = useState<MonetagDiagnostics>(getMonetagStatus());
  const [isVerifyingFile, setIsVerifyingFile] = useState(false);
  const [fileFound, setFileFound] = useState<boolean | null>(null);

  const refreshStatus = useCallback(() => {
    setStatus(getMonetagStatus());
  }, []);

  const testVerificationFile = useCallback(async () => {
    setIsVerifyingFile(true);
    try {
      const res = await fetch(`/${status.verificationFile}`, { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();
        setFileFound(text.trim().length > 0);
      } else {
        setFileFound(false);
      }
    } catch {
      setFileFound(false);
    } finally {
      setIsVerifyingFile(false);
    }
  }, [status.verificationFile]);

  useEffect(() => {
    void testVerificationFile();
    const interval = setInterval(refreshStatus, 4000);
    return () => clearInterval(interval);
  }, [testVerificationFile, refreshStatus]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Monetization Diagnostics
            </p>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Monetag Multitag, Service Worker & Page Push Integration
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refreshStatus();
              void testVerificationFile();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary/60 active:scale-95"
          >
            <RefreshCw className="size-3.5" />
            <span>Check Status</span>
          </button>
        </div>
      </div>

      {/* Primary Grid Diagnostics */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Multitag Domain */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Globe className="size-3.5" />
            <span>Multitag Domain</span>
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-foreground">{status.domain}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Zone ID: {status.zoneId}</p>
        </div>

        {/* Service Worker Status */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            <span>Service Worker</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {status.swRegistered ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="text-sm font-bold text-emerald-500">Registered</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-amber-500" />
                <span className="text-sm font-bold text-amber-500">
                  {status.lastError ? "Notice" : "Standby"}
                </span>
              </>
            )}
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
            Scope: {status.swScope || "/"}
          </p>
        </div>

        {/* Verification File Status */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="size-3.5" />
            <span>Root Verification File</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {isVerifyingFile ? (
              <span className="text-sm font-semibold text-muted-foreground animate-pulse">
                Testing...
              </span>
            ) : fileFound ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="text-sm font-bold text-emerald-500">HTTP 200 Ready</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-amber-500" />
                <span className="text-sm font-bold text-amber-500">File In Root</span>
              </>
            )}
          </div>
          <a
            href={`/${status.verificationFile}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block font-mono text-[11px] text-primary hover:underline truncate"
          >
            /{status.verificationFile}
          </a>
        </div>

        {/* Diagnostics / Initialization */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <RefreshCw className="size-3.5" />
            <span>Init Lifecycle</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-foreground">
            {status.lastInitAttempt ? "Idempotent Clean" : "Ready"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            {status.lastError ? `Notice: ${status.lastError}` : "PWA & Multitag Active"}
          </p>
        </div>
      </div>

      {/* Monetag Page Push Ad Zone Banner */}
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Radio className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Monetag Page Push</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {status.pagePush.status}
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Scope: {status.pagePush.scope}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Domain: <span className="font-mono text-foreground">{status.pagePush.domain}</span>{" "}
                · Zone ID:{" "}
                <span className="font-mono font-bold text-foreground">
                  {status.pagePush.zoneId}
                </span>{" "}
                · Script:{" "}
                <span className="font-mono text-muted-foreground">{status.pagePush.src}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs text-muted-foreground font-mono">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active on all routes</span>
          </div>
        </div>
      </div>
    </section>
  );
}
