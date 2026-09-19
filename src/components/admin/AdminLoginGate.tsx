import React, { useState } from "react";
import {
  ShieldAlert,
  KeyRound,
  Fingerprint,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  ClipboardPaste,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { cleanSecret } from "@/hooks/useAdminAuth";

interface AdminLoginGateProps {
  loginStep: "phrases" | "mfa";
  isSubmitting: boolean;
  errorMessage: string | null;
  remainingAttempts: number | null;
  isLocked: boolean;
  retryAfter: number;
  onVerifyPhrases: (phrases: {
    phrase1: string;
    phrase2: string;
    phrase3: string;
    phrase4: string;
    masterKey?: string;
  }) => Promise<boolean>;
  onVerifyMfa: (mfaCode: string) => Promise<boolean>;
  onResetLockout?: () => Promise<void> | void;
  onBackToPhrases: () => void;
}

export function AdminLoginGate({
  loginStep,
  isSubmitting,
  errorMessage,
  remainingAttempts,
  isLocked,
  retryAfter,
  onVerifyPhrases,
  onVerifyMfa,
  onResetLockout,
  onBackToPhrases,
}: AdminLoginGateProps) {
  // Mode: "split" (4 individual fields) or "bulk" (single master input box)
  const [inputMode, setInputMode] = useState<"split" | "bulk">("split");

  const [phrase1, setPhrase1] = useState("");
  const [phrase2, setPhrase2] = useState("");
  const [phrase3, setPhrase3] = useState("");
  const [phrase4, setPhrase4] = useState("");
  const [bulkInput, setBulkInput] = useState("");

  const [showPhrases, setShowPhrases] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const [mfaCode, setMfaCode] = useState("");

  // Helper to parse pasted multiline or comma-separated credentials
  const handleAutoDistributePaste = (text: string) => {
    const rawSegments = text
      .split(/[\r\n;,]+|::/)
      .map(cleanSecret)
      .filter(Boolean);

    if (rawSegments.length >= 4) {
      setPhrase1(rawSegments[0]);
      setPhrase2(rawSegments[1]);
      setPhrase3(rawSegments[2]);
      setPhrase4(rawSegments[3]);
      toast.success("Successfully distributed 4 security keys into the fields!");
      return true;
    }
    return false;
  };

  const handlePastePhrase1 = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted && (pasted.includes("\n") || pasted.includes(",") || pasted.includes("::"))) {
      if (handleAutoDistributePaste(pasted)) {
        e.preventDefault();
      }
    }
  };

  const handlePhrasesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inputMode === "bulk") {
      const trimmedBulk = bulkInput.trim();
      if (!trimmedBulk) {
        toast.error("Please enter your admin credentials");
        return;
      }
      const rawSegments = trimmedBulk
        .split(/[\r\n;,]+|::/)
        .map(cleanSecret)
        .filter(Boolean);

      if (rawSegments.length >= 4) {
        await onVerifyPhrases({
          phrase1: rawSegments[0],
          phrase2: rawSegments[1],
          phrase3: rawSegments[2],
          phrase4: rawSegments[3],
          masterKey: trimmedBulk,
        });
      } else {
        await onVerifyPhrases({
          phrase1: cleanSecret(trimmedBulk),
          phrase2: "",
          phrase3: "",
          phrase4: "",
          masterKey: trimmedBulk,
        });
      }
    } else {
      if (!phrase1 || !phrase2 || !phrase3 || !phrase4) {
        toast.error("Please enter all 4 security phrases");
        return;
      }
      await onVerifyPhrases({
        phrase1: cleanSecret(phrase1),
        phrase2: cleanSecret(phrase2),
        phrase3: cleanSecret(phrase3),
        phrase4: cleanSecret(phrase4),
      });
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = mfaCode.trim().replace(/\D/g, "");
    if (!clean) return;
    await onVerifyMfa(clean);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-3 py-8 sm:px-4 sm:py-12">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-border/80 bg-surface shadow-2xl shadow-black/20 sm:rounded-3xl">
        <div className="relative overflow-hidden bg-ink px-5 py-7 text-primary-foreground sm:px-8 sm:py-8">
          <div className="absolute -right-16 -top-16 size-40 rounded-full bg-primary/15 blur-2xl" />
          <div className="absolute -bottom-20 -left-16 size-40 rounded-full bg-sage/10 blur-2xl" />
          <div className="relative z-10">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-lg shadow-primary/10">
                {loginStep === "phrases" ? (
                  <KeyRound className="h-7 w-7 animate-pulse" />
                ) : (
                  <Fingerprint className="h-7 w-7 text-emerald-400 animate-pulse" />
                )}
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
                XoraTV Sovereign Admin Access
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-primary-foreground/60">
                {loginStep === "phrases"
                  ? "Multi-phrase cryptographic credential validation."
                  : "Step 2: Dual-factor authentication challenge."}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8">
          {/* Lockout Warning Banner with Reset Action */}
          {isLocked && (
            <div className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold">Security Lockout Active</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Temporary cooldown active after failed attempts. Providing the valid key will
                    automatically unlock access.
                  </p>
                  <p className="mt-2 font-mono font-bold text-destructive">
                    Cooldown remaining: {formatTime(retryAfter)}
                  </p>
                </div>
              </div>
              {onResetLockout && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onResetLockout()}
                    className="press inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/30"
                  >
                    <RefreshCw className="h-3 w-3" /> Reset Cooldown Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Remaining Attempts Warning */}
          {!isLocked && remainingAttempts !== null && remainingAttempts < 10 && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} remaining before
                lockout cooldown.
              </span>
            </div>
          )}

          {/* Error Message */}
          {!isLocked && errorMessage && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1: Master Credential Input */}
          {loginStep === "phrases" && (
            <form onSubmit={handlePhrasesSubmit} className="mt-5 space-y-4">
              {/* Input Mode Selector & Visibility Toggle */}
              <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid w-full grid-cols-2 rounded-xl bg-background p-0.5 text-[11px] sm:w-auto sm:text-xs">
                  <button
                    type="button"
                    onClick={() => setInputMode("split")}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      inputMode === "split"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    4 Keys (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("bulk")}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      inputMode === "bulk"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Paste All at Once
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFormatGuide(!showFormatGuide)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    title="View format requirements"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Format</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhrases(!showPhrases)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showPhrases ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Reveal
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Format Guide */}
              {showFormatGuide && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground">
                  <div className="flex items-center justify-between font-semibold text-primary">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Valid Input Format
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Quotes (<code className="font-mono text-primary">&quot;</code> or{" "}
                    <code className="font-mono text-primary">&apos;</code>), numbering prefixes (
                    <code className="font-mono text-primary">1.</code>,{" "}
                    <code className="font-mono text-primary">Phrase 1:</code>), and surrounding
                    spaces are automatically sanitized and stripped.
                  </p>
                  <div className="mt-2.5 space-y-1 font-mono text-[11px] text-muted-foreground">
                    <p>
                      <span className="text-foreground">Key 1: </span>
                      XORA@Obsidian-42!K7-Violet#Crown
                    </p>
                    <p>
                      <span className="text-foreground">Key 2: </span>
                      X9!AuroraVault#731-Quantum@Xora
                    </p>
                    <p>
                      <span className="text-foreground">Key 3: </span>
                      PurpleXora!Gate-58#Raven_4K
                    </p>
                    <p>
                      <span className="text-foreground">Key 4: </span>
                      XoraTV#Sovereign-83!Nova@Lock
                    </p>
                    <p className="pt-1 text-emerald-400">
                      <span className="text-foreground">MFA (Step 2): </span>
                      942081
                    </p>
                  </div>
                </div>
              )}

              {/* Option A: 4 Separate Fields */}
              {inputMode === "split" && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Phrase 1 (Obsidian Vault Key)
                      </label>
                      <span className="text-[10px] text-muted-foreground/80">
                        (Pasting 4 lines auto-fills all fields)
                      </span>
                    </div>
                    <input
                      id="admin-phrase-1"
                      type={showPhrases ? "text" : "password"}
                      disabled={isSubmitting}
                      value={phrase1}
                      onPaste={handlePastePhrase1}
                      onChange={(e) => setPhrase1(e.target.value)}
                      placeholder="XORA@Obsidian-42!K7-Violet#Crown"
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 font-mono text-sm tracking-wide transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Phrase 2 (Aurora Vault Key)
                    </label>
                    <input
                      id="admin-phrase-2"
                      type={showPhrases ? "text" : "password"}
                      disabled={isSubmitting}
                      value={phrase2}
                      onChange={(e) => setPhrase2(e.target.value)}
                      placeholder="X9!AuroraVault#731-Quantum@Xora"
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 font-mono text-sm tracking-wide transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Phrase 3 (Gate Token Key)
                    </label>
                    <input
                      id="admin-phrase-3"
                      type={showPhrases ? "text" : "password"}
                      disabled={isSubmitting}
                      value={phrase3}
                      onChange={(e) => setPhrase3(e.target.value)}
                      placeholder="PurpleXora!Gate-58#Raven_4K"
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 font-mono text-sm tracking-wide transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Phrase 4 (Sovereign Lock Key)
                    </label>
                    <input
                      id="admin-phrase-4"
                      type={showPhrases ? "text" : "password"}
                      disabled={isSubmitting}
                      value={phrase4}
                      onChange={(e) => setPhrase4(e.target.value)}
                      placeholder="XoraTV#Sovereign-83!Nova@Lock"
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 font-mono text-sm tracking-wide transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Option B: Single Master Key / Bulk Paste Box */}
              {inputMode === "bulk" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Master Credentials Block
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          setBulkInput(text);
                          toast.success("Pasted from clipboard!");
                        } catch {
                          toast.error("Clipboard permission not available");
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ClipboardPaste className="h-3 w-3" /> Paste Clipboard
                    </button>
                  </div>
                  <textarea
                    id="admin-bulk-credentials"
                    rows={4}
                    disabled={isSubmitting}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder={`Paste all 4 phrases (separated by newlines or commas):
XORA@Obsidian-42!K7-Violet#Crown
X9!AuroraVault#731-Quantum@Xora
PurpleXora!Gate-58#Raven_4K
XoraTV#Sovereign-83!Nova@Lock`}
                    autoComplete="off"
                    className="w-full rounded-xl border border-border bg-background/80 p-3 font-mono text-xs tracking-wide transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    You can paste all 4 lines together. Quotes, bullets, and linebreaks are handled
                    automatically.
                  </p>
                </div>
              )}

              <button
                id="admin-submit-phrases"
                type="submit"
                disabled={
                  isSubmitting ||
                  (inputMode === "split" && (!phrase1 || !phrase2 || !phrase3 || !phrase4)) ||
                  (inputMode === "bulk" && !bulkInput.trim())
                }
                className="press mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Validating Cryptographic Phrases...</span>
                ) : (
                  <>
                    <span>Verify Credentials</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: MFA / 2FA Challenge */}
          {loginStep === "mfa" && (
            <form onSubmit={handleMfaSubmit} className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Master Credentials Verified</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Please enter your 6-digit MFA authenticator security code (Default:{" "}
                  <code className="font-mono font-bold text-emerald-400">942081</code>) to authorize
                  the session.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  6-Digit 2FA / MFA Code
                </label>
                <input
                  id="admin-mfa-code"
                  type="text"
                  maxLength={6}
                  autoFocus
                  disabled={isSubmitting}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="942081"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] font-bold text-foreground transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onBackToPhrases}
                  disabled={isSubmitting}
                  className="press flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  id="admin-submit-mfa"
                  type="submit"
                  disabled={isSubmitting || mfaCode.length < 6}
                  className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Authorizing Session...</span>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      <span>Authorize Admin Session</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Security Notice Footer */}
          <div className="mt-8 border-t border-border pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Access strictly restricted to authorized platform controllers. All authentication
              attempts and telemetry are cryptographically audited.
            </p>
            <div className="mt-3">
              <Link
                to="/"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Back to Home Feed
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
