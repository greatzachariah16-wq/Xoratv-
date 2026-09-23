import React, { useEffect, useRef, useState, useMemo } from "react";

interface AdsterraBannerAdProps {
  className?: string;
  adKey?: string;
  height?: number;
  width?: number;
}

/**
 * Adsterra Compliant Banner Ad Component
 * - Uses declarative srcDoc iframe rendering to guarantee script execution
 * - Implements 30s initial refresh with randomized anonymous jitter (30s - 45s)
 * - Strict Viewport Awareness via IntersectionObserver
 * - Document Visibility & Focus tracking
 * - Cooldown enforcement & max refresh guard
 */
export function AdsterraBannerAd({
  className = "",
  adKey = "075ef17698a6be8914c3d3aaaf74c814",
  height = 50,
  width = 320,
}: AdsterraBannerAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderCount, setRenderCount] = useState<number>(0);
  const isVisibleRef = useRef<boolean>(false);
  const isTabActiveRef = useRef<boolean>(true);
  const lastRefreshTimeRef = useRef<number>(Date.now());
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate self-contained HTML document string for srcDoc
  const iframeSrcDoc = useMemo(() => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: transparent;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <script type="text/javascript">
      atOptions = {
        'key' : '${adKey}',
        'format' : 'iframe',
        'height' : ${height},
        'width' : ${width},
        'params' : {}
      };
    </script>
    <script type="text/javascript" src="https://www.highrevenueformat.com/${adKey}/invoke.js"></script>
  </body>
</html>`;
  }, [adKey, height, width]);

  // Viewport Observer & Auto-Refresh Policy Logic
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Visibility observer (requires >= 50% visibility)
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      },
      { threshold: [0.5] },
    );

    observer.observe(element);

    // Track tab focus & visibility
    const handleVisibilityChange = () => {
      isTabActiveRef.current = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Refresh interval function with policy safeguards
    const scheduleNextRefresh = () => {
      // Anonymous jitter: 30s base + random (0 to 15s) to avoid rigid bot-like refresh cycles
      const jitterMs = renderCount === 0 ? 30000 : 30000 + Math.floor(Math.random() * 15000);

      refreshTimerRef.current = setTimeout(() => {
        const now = Date.now();
        const elapsedSinceLast = now - lastRefreshTimeRef.current;
        const MIN_COOLDOWN_MS = 25000; // Policy Cooldown: min 25s between refreshes
        const MAX_REFRESHES_PER_PAGE = 20;

        const isFullyActive =
          isVisibleRef.current &&
          isTabActiveRef.current &&
          document.visibilityState === "visible" &&
          elapsedSinceLast >= MIN_COOLDOWN_MS;

        if (isFullyActive && renderCount < MAX_REFRESHES_PER_PAGE) {
          lastRefreshTimeRef.current = Date.now();
          setRenderCount((prev) => prev + 1);
        } else {
          // Re-check shortly if conditions weren't met (e.g. user scrolled away or tab blurred)
          scheduleNextRefresh();
        }
      }, jitterMs);
    };

    scheduleNextRefresh();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [renderCount]);

  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={`adsterra-banner-ad flex min-h-[50px] w-full flex-col items-center justify-center overflow-hidden transition-all ${className}`}
    >
      <iframe
        key={`adsterra-iframe-${renderCount}`}
        srcDoc={iframeSrcDoc}
        width={width}
        height={height}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          border: "none",
          overflow: "hidden",
          margin: "0 auto",
        }}
        scrolling="no"
        title="Advertisement"
      />
    </div>
  );
}
