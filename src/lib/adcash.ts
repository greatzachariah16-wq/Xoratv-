/**
 * Adcash AutoTag & Placement Helper for XoraTV
 */
declare global {
  interface Window {
    aclib?: {
      runAutoTag?: (config: { zoneId: string; [key: string]: unknown }) => void;
      [key: string]: unknown;
    };
    __adcash_autotag_initialized?: boolean;
  }
}

export const ADCASH_ZONE_ID = "bzh5a2rqfg";

/**
 * Initializes Adcash AutoTag script and executes auto-tagging.
 */
export function initAdcashAutoTag(): void {
  if (typeof window === "undefined") return;

  const run = () => {
    if (typeof window.aclib?.runAutoTag === "function") {
      try {
        window.aclib.runAutoTag({ zoneId: ADCASH_ZONE_ID });
        window.__adcash_autotag_initialized = true;
      } catch (err) {
        console.warn("[Adcash] Error running AutoTag:", err);
      }
    }
  };

  if (typeof window.aclib?.runAutoTag === "function") {
    run();
  } else {
    // Inject script dynamically with HTTPS
    if (!document.getElementById("aclib-script")) {
      const script = document.createElement("script");
      script.id = "aclib-script";
      script.type = "text/javascript";
      script.src = "https://acscdn.com/script/aclib.js";
      script.async = true;
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
      }, 200);
      setTimeout(() => clearInterval(timer), 6000);
    }
  }
}

/**
 * Re-scans for new ad placements on dynamic mounting or orientation changes.
 */
export function triggerAdcashRefresh(): void {
  if (typeof window === "undefined") return;
  if (typeof window.aclib?.runAutoTag === "function") {
    try {
      window.aclib.runAutoTag({ zoneId: ADCASH_ZONE_ID });
    } catch {
      // ignore refresh errors
    }
  }
}
