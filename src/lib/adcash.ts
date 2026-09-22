/**
 * Adcash AutoTag & Placement Helper for XoraTV
 * Supports Portrait, Landscape, Dynamic Orientation, and In-Page Slots
 */
declare global {
  interface Window {
    aclib?: {
      runAutoTag?: (config: { zoneId: string; [key: string]: unknown }) => void;
      runBanner?: (config: { zoneId: string; wrapper?: string; [key: string]: unknown }) => void;
      runPop?: (config: { zoneId: string; [key: string]: unknown }) => void;
      runInterstitial?: (config: { zoneId: string; [key: string]: unknown }) => void;
      [key: string]: unknown;
    };
    __adcash_autotag_initialized?: boolean;
    __adcash_listeners_bound?: boolean;
  }
}

export const ADCASH_ZONE_ID = "bzh5a2rqfg";

/**
 * Executes all available Adcash trigger functions for maximum multi-format reach
 */
function executeAdcashRoutines(wrapperId?: string): void {
  if (typeof window === "undefined" || !window.aclib) return;

  try {
    // 1. Run standard AutoTag scanner
    if (typeof window.aclib.runAutoTag === "function") {
      window.aclib.runAutoTag({ zoneId: ADCASH_ZONE_ID });
    }

    // 2. If a specific slot wrapper is provided, invoke banner unit
    if (wrapperId && typeof window.aclib.runBanner === "function") {
      window.aclib.runBanner({ zoneId: ADCASH_ZONE_ID, wrapper: wrapperId });
    }

    // 3. Invoke pop / interstitial if available
    if (typeof window.aclib.runPop === "function") {
      window.aclib.runPop({ zoneId: ADCASH_ZONE_ID });
    }
  } catch (err) {
    console.debug("[Adcash] Routine trigger notice:", err);
  }
}

/**
 * Initializes Adcash AutoTag script and sets up orientation change listeners.
 */
export function initAdcashAutoTag(): void {
  if (typeof window === "undefined") return;

  const run = () => {
    executeAdcashRoutines();
    window.__adcash_autotag_initialized = true;

    // Attach orientation & resize listeners once
    if (!window.__adcash_listeners_bound) {
      window.__adcash_listeners_bound = true;

      const onOrientationChange = () => {
        setTimeout(() => {
          executeAdcashRoutines();
        }, 100);
      };

      window.addEventListener("orientationchange", onOrientationChange, { passive: true });
      if (window.screen?.orientation) {
        window.screen.orientation.addEventListener("change", onOrientationChange);
      }
    }
  };

  if (typeof window.aclib?.runAutoTag === "function") {
    run();
  } else {
    // Inject script dynamically with HTTPS if not already present
    if (!document.getElementById("aclib-script")) {
      const script = document.createElement("script");
      script.id = "aclib-script";
      script.type = "text/javascript";
      script.src = "https://acscdn.com/script/aclib.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        run();
      };
      document.head.appendChild(script);
    } else {
      const timer = setInterval(() => {
        if (typeof window.aclib?.runAutoTag === "function") {
          clearInterval(timer);
          run();
        }
      }, 150);
      setTimeout(() => clearInterval(timer), 5000);
    }
  }
}

/**
 * Re-scans for new ad placements on dynamic mounting, user interactions, or orientation changes.
 */
export function triggerAdcashRefresh(wrapperId?: string): void {
  if (typeof window === "undefined") return;

  if (
    typeof window.aclib?.runAutoTag === "function" ||
    typeof window.aclib?.runBanner === "function"
  ) {
    executeAdcashRoutines(wrapperId);
  } else {
    initAdcashAutoTag();
  }
}
