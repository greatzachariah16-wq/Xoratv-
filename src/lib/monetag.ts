/**
 * Monetag Multitag & Service Worker Integration for XoraTV
 *
 * Domain: 3nbf4.com
 * Zone ID: 11865683
 * Service Worker Script: https://3nbf4.com/act/files/service-worker.min.js?r=sw
 * Verification File: /8ea04dd6a7bbda76ca13.txt
 */

export const MONETAG_DOMAIN = "3nbf4.com";
export const MONETAG_ZONE_ID = 11865683;
export const MONETAG_SW_URL = "https://3nbf4.com/act/files/service-worker.min.js?r=sw";
export const MONETAG_VERIFICATION_FILE = "8ea04dd6a7bbda76ca13.txt";

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
}

let isInitialized = false;
let initAttemptTime: string | null = null;
let lastErrorMessage: string | null = null;
let registeredScope: string | null = null;
let isSwRegistered = false;

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
  };
}

/**
 * Initialize Monetag Multitag Service Worker safely in the browser.
 * Idempotent: will execute registration at most once per application lifecycle.
 */
export async function initMonetag(): Promise<MonetagDiagnostics> {
  // Production safety: Guard against SSR / non-browser execution
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return getMonetagStatus();
  }

  // Idempotency check: prevent duplicate registration runs
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
