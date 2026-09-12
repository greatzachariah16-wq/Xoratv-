import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    affilistStart?: () => void;
  }
}

const SCRIPT_SRC = "//data527.click/js/responsive.js";
const SCRIPT_FLAG = "data-advertica-script";

// Module-level singleton: the responsive.js script is injected at most once
// per page lifetime, no matter how many times the banner mounts (SPA nav).
let scriptPromise: Promise<void> | null = null;

function loadAdverticaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.affilistStart) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_FLAG}]`);
    if (existing) {
      if (window.affilistStart) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Advertica script failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute(SCRIPT_FLAG, "true");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Advertica script failed")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Advertica 320×50 banner.
 *
 * React owns only the outer container. The exact publisher <ins> element is
 * created imperatively inside a host div that React never renders children
 * into, so Advertica's responsive.js can safely replace the <ins> with its
 * iframe without conflicting with React's DOM.
 */
export function AdverticaBanner({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Exact Advertica publisher element — values must not change.
    const ins = document.createElement("ins");
    ins.setAttribute("style", "width: 320px;height:50px;display:block");
    ins.setAttribute("data-width", "320");
    ins.setAttribute("data-height", "50");
    ins.setAttribute("class", "v7ed5decc00");
    ins.setAttribute("data-domain", "//data527.click");
    ins.setAttribute("data-affquery", "/ca12d9f8b146314924fe/7ed5decc00/?placementName=default");
    host.appendChild(ins);

    let cancelled = false;
    loadAdverticaScript()
      .then(() => {
        if (cancelled) return;
        window.affilistStart?.();
      })
      .catch(() => {
        // Script blocked/unavailable: leave the slot empty, app unaffected.
      });

    return () => {
      cancelled = true;
      // Remove Advertica's generated iframe/<ins> so navigation never
      // accumulates duplicate ad elements.
      host.replaceChildren();
    };
  }, []);

  return (
    <div
      className={cn("mx-auto w-full max-w-[320px] overflow-hidden", className)}
      style={{ width: 320, height: 50 }}
      data-advertica-slot
    >
      <div ref={hostRef} className="mx-auto" style={{ width: 320, height: 50 }} />
    </div>
  );
}
