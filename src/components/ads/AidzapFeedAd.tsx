import { useEffect, useRef, useState } from "react";

const PREVIEW_NO_ADS = import.meta.env.VITE_PREVIEW_NO_ADS === "true";
const AIDZAP_URL = "https://aidzap.com/ad/f11d0b5b-76a5-49ff-b3cc-bcde75cfa182";

export function AidzapFeedAd({ className = "" }: { className?: string }) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (PREVIEW_NO_ADS || inView) return;
    const slot = slotRef.current;
    if (!slot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px 0px", threshold: 0.01 },
    );

    observer.observe(slot);
    return () => observer.disconnect();
  }, [inView]);

  if (PREVIEW_NO_ADS) return null;

  return (
    <div className={`my-4 flex w-full justify-center ${className}`}>
      <div
        ref={slotRef}
        className="flex min-h-[180px] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-surface/40"
        aria-label="Sponsored advertisement"
      >
        {inView ? (
          <iframe
            title="Aidzap sponsored advertisement"
            src={AIDZAP_URL}
            width="240"
            height="400"
            scrolling="no"
            frameBorder="0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{
              border: "none",
              width: "min(240px, calc(100vw - 2rem))",
              height: "min(400px, calc(100dvh - 8rem))",
              minHeight: "180px",
              display: "block",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
