import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface AdminSessionInfo {
  sessionId: string;
  expiresAt: number;
  lastActiveAt: number;
}

const STORAGE_KEY = "xora_admin_token";

function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token);
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage exceptions
  }
}

export function cleanSecret(val: string): string {
  if (!val) return "";
  let clean = val.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "").trim();
  // Strip outer quotes, smart quotes, backticks
  clean = clean.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  // Strip leading numbering or labels like "1. ", "Phrase 1: ", "P1: ", "#1: "
  clean = clean.replace(/^(?:(?:phrase|key|p)\s*\d+[:.-]?|#?\d+[:.-])\s*/i, "").trim();
  // Strip outer quotes again if inside label
  clean = clean.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  return clean;
}

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [sessionInfo, setSessionInfo] = useState<AdminSessionInfo | null>(null);

  // Authentication Flow States
  const [loginStep, setLoginStep] = useState<"phrases" | "mfa">("phrases");
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // Check current session from HTTP-only cookie and stored Bearer token on mount
  const checkSession = useCallback(async () => {
    try {
      setCheckingSession(true);
      const token = getStoredToken();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/admin/session", {
        headers,
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.role === "admin") {
          setIsAuthenticated(true);
          setSessionInfo(data.session || null);
          setErrorMessage(null);
          return;
        }
      }
      setIsAuthenticated(false);
      setSessionInfo(null);
    } catch {
      setIsAuthenticated(false);
      setSessionInfo(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Handle countdown for lockout
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [retryAfter]);

  // Emergency Reset Lockout
  const resetLockout = async () => {
    try {
      await fetch("/api/admin/auth/reset-lockout", {
        method: "POST",
        credentials: "include",
      });
      setIsLocked(false);
      setRetryAfter(0);
      setRemainingAttempts(10);
      setErrorMessage(null);
      toast.success("Security lockouts and cooldowns have been reset.");
    } catch {
      toast.error("Failed to communicate with lockout reset endpoint.");
    }
  };

  // Step 1: Verify Credential Phrases
  const verifyPhrases = async (phrases: {
    phrase1: string;
    phrase2: string;
    phrase3: string;
    phrase4: string;
    masterKey?: string;
  }) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    let p1 = cleanSecret(phrases.phrase1);
    let p2 = cleanSecret(phrases.phrase2);
    let p3 = cleanSecret(phrases.phrase3);
    let p4 = cleanSecret(phrases.phrase4);

    const bulk = phrases.masterKey || (!p2 && !p3 && !p4 ? p1 : "");
    if (bulk) {
      const parts = bulk
        .split(/[\r\n;,|•]+|::|\s{2,}/)
        .map(cleanSecret)
        .filter(Boolean);
      if (parts.length >= 4) {
        p1 = parts[0];
        p2 = parts[1];
        p3 = parts[2];
        p4 = parts[3];
      }
    }

    const payload = {
      phrase1: p1,
      phrase2: p2,
      phrase3: p3,
      phrase4: p4,
      masterKey: phrases.masterKey ? phrases.masterKey.trim() : undefined,
    };

    try {
      const res = await fetch("/api/admin/auth/verify-phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.locked || res.status === 429) {
          setIsLocked(true);
          setRetryAfter(data.retryAfter || 300);
          setErrorMessage(data.error || "Security lockout active. Please wait or use reset.");
        } else {
          setErrorMessage(data.error || "Invalid administrator credentials.");
          if (typeof data.remainingAttempts === "number") {
            setRemainingAttempts(data.remainingAttempts);
          }
        }
        toast.error(data.error || "Authentication failed");
        return false;
      }

      // Step 1 Success -> Advance to MFA
      setIsLocked(false);
      setRetryAfter(0);
      setMfaTicket(data.mfaTicket);
      setLoginStep("mfa");
      setErrorMessage(null);
      setRemainingAttempts(null);
      toast.success("Master credentials verified. Please enter 2FA / MFA code.");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error during authentication";
      setErrorMessage(msg);
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify MFA / 2FA Code
  const verifyMfa = async (mfaCode: string) => {
    if (!mfaTicket) {
      setErrorMessage("Missing MFA ticket. Please re-enter credentials.");
      setLoginStep("phrases");
      return false;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const cleanCode = cleanSecret(mfaCode).replace(/\D/g, "");
      const res = await fetch("/api/admin/auth/verify-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mfaTicket, mfaCode: cleanCode }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.locked || res.status === 429) {
          setIsLocked(true);
          setRetryAfter(data.retryAfter || 300);
          setErrorMessage(data.error || "Security lockout active.");
        } else {
          setErrorMessage(data.error || "Invalid MFA code.");
          if (typeof data.remainingAttempts === "number") {
            setRemainingAttempts(data.remainingAttempts);
          }
        }
        toast.error(data.error || "MFA Verification failed");
        return false;
      }

      // Step 2 Success -> Full Authentication!
      if (data.sessionToken) {
        setStoredToken(data.sessionToken);
      }
      setIsAuthenticated(true);
      setSessionInfo({
        sessionId: data.sessionId || "admin-session",
        expiresAt: data.expiresAt || Date.now() + 7200000,
        lastActiveAt: Date.now(),
      });
      setLoginStep("phrases");
      setMfaTicket(null);
      setErrorMessage(null);
      setIsLocked(false);
      setRetryAfter(0);
      toast.success("Welcome, Administrator. Session authorized.");
      void checkSession();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MFA Verification error";
      setErrorMessage(msg);
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign out
  const logout = async () => {
    const token = getStoredToken();
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/admin/logout", {
        method: "POST",
        headers,
        credentials: "include",
      });
    } catch {
      // Ignore network failure on logout
    }
    setStoredToken(null);
    setIsAuthenticated(false);
    setSessionInfo(null);
    setLoginStep("phrases");
    setMfaTicket(null);
    toast.info("Administrator session ended.");
  };

  return {
    isAuthenticated,
    checkingSession,
    sessionInfo,
    loginStep,
    setLoginStep,
    isSubmitting,
    errorMessage,
    remainingAttempts,
    isLocked,
    retryAfter,
    verifyPhrases,
    verifyMfa,
    resetLockout,
    logout,
    refreshSession: checkSession,
  };
}
