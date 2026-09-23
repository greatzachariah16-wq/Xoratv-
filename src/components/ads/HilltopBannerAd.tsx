import React, { useEffect, useRef } from "react";

interface HilltopBannerAdProps {
  className?: string;
  slotId?: string;
}

export function HilltopBannerAd({ className = "", slotId }: HilltopBannerAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous ad content
    container.innerHTML = "";

    const script = document.createElement("script");
    script.text = `
      (function(sop){
        var d = document,
            s = d.createElement('script'),
            l = d.currentScript || d.scripts[d.scripts.length - 1];
        s.settings = sop || {};
        s.src = "//untimely-hello.com/b/XnV/s/d.GFlt0NYgWpcs/Re/mb9/unZEUjlCkMPuTAcK0_N-TBEfyHMvDOU/tCN/zjQ/1/M/TkIewyO/Q_";
        s.async = true;
        s.referrerPolicy = 'no-referrer-when-downgrade';
        if (l && l.parentNode) {
          l.parentNode.insertBefore(s, l);
        } else {
          document.body.appendChild(s);
        }
      })({});
    `;

    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [slotId]);

  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={`hilltop-banner-slot my-3 min-h-[50px] w-full flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-surface/30 p-1 text-center text-xs text-muted-foreground ${className}`}
    >
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50">Sponsored</span>
    </div>
  );
}
