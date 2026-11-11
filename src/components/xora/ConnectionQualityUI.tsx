import { useEffect, useRef, useState } from "react";
import type { ConnectionQuality, ConnectionQualityMode, PlaybackStatus } from "./use-connection-quality";

type SignalChipProps = {
  quality: ConnectionQuality;
  expanded: boolean;
  mode: ConnectionQualityMode;
  activityKey?: number;
  hideUntilControls?: boolean;
  onOpen: () => void;
  onSelectMode: (mode: ConnectionQualityMode) => void;
};

type BufferOverlayProps = {
  status: PlaybackStatus;
  bufferPercent?: number | null;
  toast?: string;
  onRetry: () => void;
  onDataSaver: () => void;
};

const qualityCopy: Record<ConnectionQuality, { label: string; bars: number; color: string }> = {
  good: { label: "Smooth", bars: 3, color: "text-signal-good" },
  fair: { label: "Fair", bars: 2, color: "text-signal-fair" },
  weak: { label: "Weak", bars: 1, color: "text-primary" },
};

function SignalBars({ quality, className = "" }: { quality: ConnectionQuality; className?: string }) {
  const activeBars = qualityCopy[quality].bars;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 14"
      className={"h-3.5 w-[18px] shrink-0 " + qualityCopy[quality].color + " " + className}
      fill="currentColor"
    >
      <rect x="1" y="8.5" width="3.5" height="4.5" rx="1" opacity={activeBars >= 1 ? 1 : 0.24} />
      <rect x="7.25" y="5" width="3.5" height="8" rx="1" opacity={activeBars >= 2 ? 1 : 0.24} />
      <rect x="13.5" y="1" width="3.5" height="12" rx="1" opacity={activeBars >= 3 ? 1 : 0.24} />
    </svg>
  );
}

export function SignalChip({
  quality,
  expanded,
  mode,
  activityKey = 0,
  hideUntilControls = false,
  onOpen,
  onSelectMode,
}: SignalChipProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [temporarilyExpanded, setTemporarilyExpanded] = useState(true);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const qualityLabel = qualityCopy[quality].label;

  useEffect(() => {
    setTemporarilyExpanded(true);
    const timer = window.setTimeout(() => setTemporarilyExpanded(false), 3_000);
    return () => window.clearTimeout(timer);
  }, [quality, activityKey]);

  useEffect(() => {
    if (!popoverOpen) return;

    const closeOnOutsideTap = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        setPopoverOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopoverOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [popoverOpen]);

  const isExpanded = expanded || temporarilyExpanded || popoverOpen;

  return (
    <div
      ref={wrapperRef}
      className={
        "pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] left-[max(12px,calc(env(safe-area-inset-left,0px)+12px))] z-30 " +
        (hideUntilControls ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100")
      }
    >
      <button
        type="button"
        aria-label={"Connection: " + qualityLabel}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        onClick={() => {
          setPopoverOpen((open) => !open);
          onOpen();
        }}
        className="pointer-events-auto flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 text-xs font-semibold tabular-nums text-white shadow-lg backdrop-blur-md transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black/80"
      >
        <SignalBars quality={quality} className="transition-transform duration-200 motion-reduce:transition-none" />
        {isExpanded ? <span>{qualityLabel}</span> : null}
      </button>

      {popoverOpen ? (
        <div
          role="dialog"
          aria-label="Playback quality settings"
          className="pointer-events-auto absolute bottom-full left-0 mb-2 w-52 rounded-2xl border border-white/10 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-xl"
        >
          <p className="mb-3 text-xs font-semibold">Playback: {qualityLabel}</p>
          <div role="group" aria-label="Playback quality" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {(["auto", "data-saver", "high"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  onSelectMode(option);
                  setPopoverOpen(false);
                }}
                className="min-h-11 rounded-lg px-1 text-[10px] font-semibold capitalize text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:bg-primary aria-pressed:text-white"
              >
                {option === "data-saver" ? "Data saver" : option === "auto" ? "Auto" : "High"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BufferOverlay({
  status,
  bufferPercent,
  toast,
  onRetry,
  onDataSaver,
}: BufferOverlayProps) {
  const visible = status === "stalled" || status === "longStalled" || status === "recovering";
  const longStalled = status === "longStalled";
  const recovering = status === "recovering";

  if (status === "hint") {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-primary opacity-90 animate-pulse motion-reduce:animate-none" />
    );
  }

  if (!visible && !toast) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-200">
      {visible ? (
        <div className={"absolute inset-0 bg-black/20 transition-opacity duration-200 " + (recovering ? "opacity-0" : "opacity-100")} aria-hidden="true" />
      ) : null}

      {status === "stalled" || longStalled ? (
        <div className={"absolute inset-0 flex items-center justify-center transition-opacity duration-200 " + (recovering ? "opacity-0" : "opacity-100")}>
          <div className="relative grid size-9 place-items-center">
            <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin motion-reduce:animate-none" />
            {bufferPercent !== null && bufferPercent !== undefined ? (
              <span className="text-[9px] font-semibold tabular-nums text-white">{bufferPercent}%</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible ? (
        <div
          role="status"
          aria-live="polite"
          className={
            "pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md transition-opacity duration-200 " +
            (recovering ? "opacity-0" : "opacity-100")
          }
        >
          {recovering ? (
            <span>Connection recovered</span>
          ) : (
            <>
              <SignalBars quality="weak" />
              <span>Weak connection, hang tight</span>
              {longStalled ? (
                <>
                  <button
                    type="button"
                    onClick={onDataSaver}
                    className="pointer-events-auto min-h-11 rounded-full border border-white/20 bg-white/10 px-3 font-semibold text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    Data saver
                  </button>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="pointer-events-auto min-h-11 rounded-full bg-primary px-4 font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    Retry
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom,0px)+7.75rem)] left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/75 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
