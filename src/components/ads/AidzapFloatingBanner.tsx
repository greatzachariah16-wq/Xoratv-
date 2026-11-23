import { useEffect, useState } from "react";
import { X } from "lucide-react";

const PREVIEW_NO_ADS = import.meta.env.VITE_PREVIEW_NO_ADS === "true";
const AD_URL = "https://aidzap.com/ad/f11d0b5b-76a5-49ff-b3cc-bcde75cfa182";
const VISIBLE_MS = 30_000;
const HIDDEN_MS = 30_000;

/**
 * Aidzap's 240x400 creative behaves like a YouTube-style floating banner:
 * it stays up for 30 seconds, drops away for 30 seconds, and repeats.
 * Closing it starts the same 30-second hidden interval before it rises again.
 */
export function AidzapFloatingBanner() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (PREVIEW_NO_ADS) return;
    const timer = window.setTimeout(
      () => setIsVisible((visible) => !visible),
      isVisible ? VISIBLE_MS : HIDDEN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  if (PREVIEW_NO_ADS) return null;

  return (
    <div
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-1/2 z-[40] -translate-x-1/2 sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0"
      aria-label="Sponsored advertisement"
    >
      <div
        className="relative transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{
          transform: isVisible ? "translateY(0)" : "translateY(calc(100% + 28px))",
          pointerEvents: isVisible ? "auto" : "none",
        }}
        aria-hidden={!isVisible}
      >
        <iframe
          src={AD_URL}
          width="240"
          height="400"
          title="Sponsored advertisement"
          scrolling="no"
          frameBorder="0"
          style={{
            display: "block",
            width: "min(240px, calc(100vw - 24px))",
            height: "min(400px, calc(100dvh - 110px))",
            border: "none",
            borderRadius: "12px",
            background: "transparent",
          }}
          loading="eager"
        />
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="absolute -right-2 -top-2 z-10 grid size-8 place-items-center rounded-full border border-white/70 bg-[#2a1f1a] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Close advertisement"
          title="Close advertisement"
          tabIndex={isVisible ? 0 : -1}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
