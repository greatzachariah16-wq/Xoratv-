import { useEffect, useState } from "react";
import { BadgeInfo, ChevronDown, Megaphone, X } from "lucide-react";

const PREVIEW_NO_ADS = import.meta.env.VITE_PREVIEW_NO_ADS === "true";
const DISMISSED_KEY = "xora_aidzap_sticky_dismissed_session";

export function AidzapStickyAd() {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (PREVIEW_NO_ADS) return;
    let wasDismissed = false;
    try {
      wasDismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Continue without session persistence when storage is unavailable.
    }
    setDismissed(wasDismissed);
    if (!wasDismissed && window.matchMedia("(min-width: 768px)").matches) {
      const timer = window.setTimeout(() => setExpanded(true), 8000);
      return () => window.clearTimeout(timer);
    }
  }, []);

  if (PREVIEW_NO_ADS || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    setExpanded(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // The ad can still be dismissed when storage is unavailable.
    }
  };

  return (
    <aside
      aria-label="Sponsored advertisement"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[45] sm:bottom-5 sm:right-5"
    >
      {expanded ? (
        <div className="w-[min(264px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Megaphone className="size-3.5" aria-hidden="true" />
              Sponsored
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Minimize advertisement"
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close advertisement for this session"
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl bg-muted/40">
            <iframe
              title="Aidzap sponsored advertisement"
              src="https://aidzap.com/ad/f11d0b5b-76a5-49ff-b3cc-bcde75cfa182"
              width="240"
              height="400"
              scrolling="no"
              frameBorder="0"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{
                border: "none",
                width: "min(240px, calc(100vw - 3.5rem))",
                height: "min(400px, calc(100dvh - 12rem))",
                minHeight: "180px",
                display: "block",
              }}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open sponsored advertisement"
          className="group inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 py-2.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Megaphone className="size-4" aria-hidden="true" />
          </span>
          <span>Sponsored</span>
          <BadgeInfo className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}
