/**
 * Monetag Multitag, Service Worker & Page Push Integration for XoraTV
 *
 * 1. Multitag & Service Worker:
 *    - Domain: 3nbf4.com
 *    - Zone ID: 11865683
 *    - SW Script: https://3nbf4.com/act/files/service-worker.min.js?r=sw
 *    - Verification File: /8ea04dd6a7bbda76ca13.txt
 *
 * 2. Page Push Global Advertisement:
 *    - Domain: nap5k.com
 *    - Zone ID: 11865738
 *    - Script: https://nap5k.com/tag.min.js
 */

export const MONETAG_DOMAIN = "3nbf4.com";
export const MONETAG_ZONE_ID = 11865683;
export const MONETAG_SW_URL = "https://3nbf4.com/act/files/service-worker.min.js?r=sw";
export const MONETAG_VERIFICATION_FILE = "8ea04dd6a7bbda76ca13.txt";

export const MONETAG_PAGE_PUSH_DOMAIN = "nap5k.com";
export const MONETAG_PAGE_PUSH_ZONE_ID = "11865738";
export const MONETAG_PAGE_PUSH_SRC = "https://nap5k.com/tag.min.js";

export interface MonetagDiagnostics {
  domain: string;
  zoneId: number;
  swScriptUrl: string;
  verificationFile: string;
  swRegistered: boolean;
  swScope: string | null;
  lastInitAttempt: string | null;
  lastError: string | null;
  isSecureContext: boolean;
  pagePush: {
    domain: string;
    zoneId: string;
    src: string;
    status: "Enabled" | "Standby" | "Notice";
    scope: "Global";
    injected: boolean;
  };
}

let isInitialized = false;
let isPagePushInitialized = false;
let initAttemptTime: string | null = null;
let lastErrorMessage: string | null = null;
let registeredScope: string | null = null;
let isSwRegistered = false;

/**
 * Initialize Monetag Page Push globally across all XoraTV routes.
 * Idempotent: ensures the script is appended exactly once per application session.
 */
export function initMonetagPagePush(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  // Idempotency check: prevent duplicate injections across route transitions
  if (
    isPagePushInitialized ||
    document.querySelector(`script[src="${MONETAG_PAGE_PUSH_SRC}"]`) ||
    document.querySelector(`script[data-zone="${MONETAG_PAGE_PUSH_ZONE_ID}"]`)
  ) {
    isPagePushInitialized = true;
    return true;
  }

  try {
    const s = document.createElement("script");
    s.dataset.zone = MONETAG_PAGE_PUSH_ZONE_ID;
    s.src = MONETAG_PAGE_PUSH_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      if (import.meta.env?.DEV) {
        console.warn("[Monetag Page Push] Script load notice (may be blocked or offline).");
      }
    };

    // Monetag injection anchor
    const target = [document.documentElement, document.body].filter(Boolean).pop();
    if (target) {
      target.appendChild(s);
      isPagePushInitialized = true;
      if (import.meta.env?.DEV) {
        console.log(
          `[Monetag Page Push] Injected globally (Zone: ${MONETAG_PAGE_PUSH_ZONE_ID}, Domain: ${MONETAG_PAGE_PUSH_DOMAIN})`,
        );
      }
      return true;
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn("[Monetag Page Push] Initialization note:", err);
    }
  }

  return false;
}

/**
 * Get current Monetag diagnostics (for admin/debug views)
 */
export function getMonetagStatus(): MonetagDiagnostics {
  const isSecure =
    typeof window !== "undefined"
      ? window.isSecureContext || window.location.hostname === "localhost"
      : false;

  const hasPagePushScript =
    typeof document !== "undefined"
      ? Boolean(document.querySelector(`script[src="${MONETAG_PAGE_PUSH_SRC}"]`))
      : false;

  return {
    domain: MONETAG_DOMAIN,
    zoneId: MONETAG_ZONE_ID,
    swScriptUrl: MONETAG_SW_URL,
    verificationFile: MONETAG_VERIFICATION_FILE,
    swRegistered: isSwRegistered,
    swScope: registeredScope,
    lastInitAttempt: initAttemptTime,
    lastError: lastErrorMessage,
    isSecureContext: isSecure,
    pagePush: {
      domain: MONETAG_PAGE_PUSH_DOMAIN,
      zoneId: MONETAG_PAGE_PUSH_ZONE_ID,
      src: MONETAG_PAGE_PUSH_SRC,
      status: isPagePushInitialized || hasPagePushScript ? "Enabled" : "Standby",
      scope: "Global",
      injected: isPagePushInitialized || hasPagePushScript,
    },
  };
}

/**
 * Initialize Monetag Multitag Service Worker & Page Push safely in the browser.
 * Idempotent: will execute registration at most once per application lifecycle.
 */
export async function initMonetag(): Promise<MonetagDiagnostics> {
  // Production safety: Guard against SSR / non-browser execution
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return getMonetagStatus();
  }

  // Always ensure Page Push is active globally
  initMonetagPagePush();

  // Idempotency check: prevent duplicate service-worker registration runs
  if (isInitialized) {
    return getMonetagStatus();
  }
  isInitialized = true;
  initAttemptTime = new Date().toISOString();

  // Check if Service Worker API is supported
  if (!("serviceWorker" in navigator)) {
    lastErrorMessage = "Service Workers are not supported in this browser environment.";
    if (import.meta.env?.DEV) {
      console.warn("[Monetag] Service workers not supported in this environment.");
    }
    return getMonetagStatus();
  }

  try {
    // Check existing registrations to avoid conflicts
    const existingRegistrations = await navigator.serviceWorker.getRegistrations();
    const rootRegistration = existingRegistrations.find(
      (reg) => reg.scope === `${window.location.origin}/` || reg.scope.endsWith("/"),
    );

    if (rootRegistration) {
      registeredScope = rootRegistration.scope;
      isSwRegistered = true;
      if (import.meta.env?.DEV) {
        console.log(`[Monetag] Found existing root service worker at scope: ${registeredScope}`);
      }
    }

    // Register /sw.js with root scope '/'
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    registeredScope = registration.scope;
    isSwRegistered = true;
    lastErrorMessage = null;

    if (import.meta.env?.DEV) {
      console.log(
        `[Monetag] Service worker successfully registered with scope: ${registration.scope} (Zone: ${MONETAG_ZONE_ID})`,
      );
    }
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err);
    lastErrorMessage = errorText;
    if (import.meta.env?.DEV) {
      console.warn("[Monetag] Service worker registration note:", errorText);
    }
    // Fail silently in production without disrupting video playback, auth, or navigation
  }

  return getMonetagStatus();
}
