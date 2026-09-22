/**
 * Monetag Multitag, Service Worker & Page Push Integration for XoraTV
 *
 * Multitag / SW (3nbf4.com):
 * Domain: 3nbf4.com
 * Zone ID: 11865683
 * Service Worker Script: https://3nbf4.com/act/files/service-worker.min.js?r=sw
 * Verification File: /8ea04dd6a7bbda76ca13.txt
 *
 * Page Push Format (nap5k.com):
 * Network: Monetag
 * Format: Page Push
 * Zone ID: 11865738
 * Script URL: https://nap5k.com/tag.min.js
 */

export const MONETAG_DOMAIN = "3nbf4.com";
export const MONETAG_ZONE_ID = 11865683;
export const MONETAG_SW_URL = "https://3nbf4.com/act/files/service-worker.min.js?r=sw";
export const MONETAG_VERIFICATION_FILE = "8ea04dd6a7bbda76ca13.txt";

export const MONETAG_PAGE_PUSH_ZONE_ID = "11865738";
export const MONETAG_PAGE_PUSH_SCRIPT_URL = "https://nap5k.com/tag.min.js";

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
  // Page Push format diagnostics
  pagePushZoneId: string;
  pagePushScriptUrl: string;
  pagePushInjected: boolean;
  pagePushError: string | null;
}

let isInitialized = false;
let initAttemptTime: string | null = null;
let lastErrorMessage: string | null = null;
let registeredScope: string | null = null;
let isSwRegistered = false;

let isPagePushInitialized = false;
let isPagePushInjected = false;
let pagePushErrorText: string | null = null;

/**
 * Get current Monetag diagnostics and service-worker status (for admin/debug views)
 */
export function getMonetagStatus(): MonetagDiagnostics {
  const isSecure =
    typeof window !== "undefined"
      ? window.isSecureContext || window.location.hostname === "localhost"
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
    pagePushZoneId: MONETAG_PAGE_PUSH_ZONE_ID,
    pagePushScriptUrl: MONETAG_PAGE_PUSH_SCRIPT_URL,
    pagePushInjected: isPagePushInjected,
    pagePushError: pagePushErrorText,
  };
}

/**
 * Initialize Monetag Page Push format safely & globally.
 * Idempotent: checks for existing script element and flag to prevent duplicate injection.
 */
export function initMonetagPagePush(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  // Idempotency & Duplicate Check: prevent re-injection across SPA navigation & remounts
  if (
    isPagePushInitialized ||
    document.querySelector(`script[src*="nap5k.com"]`) ||
    document.querySelector(`script[data-zone="${MONETAG_PAGE_PUSH_ZONE_ID}"]`)
  ) {
    isPagePushInjected = true;
    if (import.meta.env?.DEV) {
      console.log(
        `[Monetag Page Push] Script already active or injected for Zone ${MONETAG_PAGE_PUSH_ZONE_ID}. Skipping duplicate run.`,
      );
    }
    return;
  }

  isPagePushInitialized = true;

  try {
    // Exact Monetag Page Push initialization injection logic
    const script = document.createElement("script");
    script.dataset.zone = MONETAG_PAGE_PUSH_ZONE_ID;
    script.src = MONETAG_PAGE_PUSH_SCRIPT_URL;
    script.async = true;

    script.onerror = (err) => {
      pagePushErrorText = "Network or adblocker prevented Page Push script load.";
      if (import.meta.env?.DEV) {
        console.warn("[Monetag Page Push] Script load error (adblocker/network):", err);
      }
    };

    script.onload = () => {
      isPagePushInjected = true;
      pagePushErrorText = null;
      if (import.meta.env?.DEV) {
        console.log(
          `[Monetag Page Push] Script loaded successfully for Zone: ${MONETAG_PAGE_PUSH_ZONE_ID}`,
        );
      }
    };

    const target = [document.documentElement, document.body].filter(Boolean).pop() || document.head;
    target.appendChild(script);
    isPagePushInjected = true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    pagePushErrorText = errorMsg;
    if (import.meta.env?.DEV) {
      console.warn("[Monetag Page Push] Error attaching Page Push script:", err);
    }
  }
}

/**
 * Initialize Monetag Multitag Service Worker & Page Push safely in the browser.
 * Idempotent: will execute registration at most once per application lifecycle.
 */
export async function initMonetag(): Promise<MonetagDiagnostics> {
  // Always trigger idempotent Page Push injection
  initMonetagPagePush();

  // Production safety: Guard against SSR / non-browser execution
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return getMonetagStatus();
  }

  // Idempotency check: prevent duplicate SW registration runs
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
    // Check existing registrations to avoid conflicts or duplicate scope registrations
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
