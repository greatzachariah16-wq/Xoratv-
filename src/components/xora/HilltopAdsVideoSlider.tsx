import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const SCRIPT_SRC =
  "//gummy-debt.com/bUXhV.s/drGmlk0BY/Wbct/beUmJ9suXZHU/lokzPbTicDz-N_zXQ/y/OEDDkstQN/zQMn3nNKD/Ik5/M/wv";

/**
 * HilltopAds Video Slider placement.
 *
 * Each instance owns its own container. The publisher script is injected
 * imperatively into that container (never rendered as JSX text), and a
 * per-container guard prevents React re-renders from creating duplicates.
 */
export function HilltopAdsVideoSlider({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const injected = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || injected.current) return;
    injected.current = true;

    const s = document.createElement("script");
    (s as HTMLScriptElement & { settings?: Record<string, unknown> }).settings = {};
    s.src = SCRIPT_SRC;
    s.async = true;
    s.referrerPolicy = "no-referrer-when-downgrade";
    host.appendChild(s);

    return () => {
      injected.current = false;
      host.replaceChildren();
    };
  }, []);

  return (
    <div
      className={cn("w-full max-w-full overflow-x-clip", className)}
      data-hilltop-slot
      ref={hostRef}
    />
  );
}
