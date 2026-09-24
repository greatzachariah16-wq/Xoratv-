import React, { useEffect, useRef, useState } from "react";

interface AdsterraBannerAdProps {
  className?: string;
  adKey?: string;
  height?: number;
  width?: number;
}

/**
 * Adsterra Compliant Banner Ad Component
 * - Renders ad inside an isolated iframe to guarantee visible DOM rendering (prevents document.write blocking)
 * - Restores normal 30-second refresh interval
 * - Clean document visibility tracking (pauses while backgrounded, resumes when user returns)
 * - Safe unmount cleanup preventing memory leaks
 */
export function AdsterraBannerAd({
  className = "",
  adKey = "075ef17698a6be8914c3d3aaaf74c814",
  height = 50,
  width = 320,
}: AdsterraBannerAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  // Mount guard for SSR to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Normal 30-second refresh timer
  useEffect(() => {
    if (!isMounted) return;

    const REFRESH_INTERVAL_MS = 30000; // Normal 30s refresh

    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      // Only refresh if tab is active and visible
      if (document.visibilityState === "visible" && isVisibleRef.current) {
        setRefreshIndex((prev) => prev + 1);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMounted]);

  // Construct srcdoc HTML payload with explicit atOptions and invoke.js
  const adHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  <script type="text/javascript">
    atOptions = {
      'key': '${adKey}',
      'format': 'iframe',
      'height': ${height},
      'width': ${width},
      'params': {}
    };
  </script>
  <script type="text/javascript" src="https://www.highrevenueformat.com/${adKey}/invoke.js"></script>
</body>
</html>`;

  return (
    <div
      ref={containerRef}
      id={`adsterra-banner-${adKey}`}
      suppressHydrationWarning
      className={`adsterra-banner-ad flex min-h-[50px] min-w-[320px] items-center justify-center overflow-hidden transition-all ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {isMounted && (
        <iframe
          key={`adsterra-iframe-${adKey}-${refreshIndex}`}
          srcDoc={adHtml}
          title="Advertisement"
          width={width}
          height={height}
          frameBorder="0"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          style={{
            border: 0,
            width: `${width}px`,
            height: `${height}px`,
            overflow: "hidden",
            display: "block",
          }}
        />
      )}
    </div>
  );
}
