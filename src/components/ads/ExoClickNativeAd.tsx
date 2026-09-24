import React, { useEffect, useRef } from "react";

declare global {
  interface Window {
    AdProvider?: Array<Record<string, unknown>>;
  }
}

interface ExoClickNativeAdProps {
  className?: string;
  zoneId?: string;
}

export function ExoClickNativeAd({ className = "", zoneId = "6037222" }: ExoClickNativeAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Dynamically load magsrv ad-provider script if not already present
    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://a.magsrv.com/ad-provider.js"]',
    );

    if (!script) {
      script = document.createElement("script");
      script.src = "https://a.magsrv.com/ad-provider.js";
      script.async = true;
      script.type = "application/javascript";
      document.body.appendChild(script);
    }

    // Trigger ad serve execution
    try {
      window.AdProvider = window.AdProvider || [];
      window.AdProvider.push({ serve: {} });
    } catch (err) {
      console.warn("ExoClick AdProvider execution warning:", err);
    }
  }, [zoneId]);

  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={`exoclick-native-ad flex min-h-[100px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-surface/60 p-3 text-center text-xs text-muted-foreground shadow-xs transition-all hover:border-primary/40 ${className}`}
    >
      <ins className="eas6a97888e20" data-zoneid={zoneId}></ins>
      <span className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground/40 font-medium">
        Sponsored Recommendation
      </span>
    </div>
  );
}
