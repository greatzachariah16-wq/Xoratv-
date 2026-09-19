import { useState, useEffect } from "react";
import { Gauge, Smartphone, Check, Activity, ChevronDown, X } from "lucide-react";
import { useDataSaver, type DataSaverMode } from "@/lib/data-saver";
import { cn } from "@/lib/utils";

export function DataSaverBadge({ className }: { className?: string }) {
  const { config, stats, setMode } = useDataSaver();
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const modes: {
    id: DataSaverMode;
    label: string;
    description: string;
    rate: string;
    tag: string;
  }[] = [
    {
      id: "300mb_saver",
      label: "300 MB / hr Max (Optimized)",
      description: "Strict 300MB/hr budget. Crisp 360p video, 550kbps bitrate ceiling.",
      rate: "≤ 300 MB/h",
      tag: "Recommended",
    },
    {
      id: "150mb_ultra",
      label: "150 MB / hr Ultra Saver",
      description: "Extreme data preservation for low data caps and 2G/3G networks.",
      rate: "≤ 150 MB/h",
      tag: "Ultra Low",
    },
    {
      id: "auto",
      label: "Smart Adaptive",
      description: "Automatically caps to 300MB/hr on cellular & mobile networks.",
      rate: "Adaptive",
      tag: "Auto",
    },
    {
      id: "off",
      label: "Standard Quality (Unlimited)",
      description: "Uncapped high definition for high-speed Wi-Fi and fiber connections.",
      rate: "Uncapped",
      tag: "Full HD",
    },
  ];

  return (
    <>
      <button
        type="button"
        id="btn-data-saver-toggle"
        onClick={() => setIsOpen(true)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1 text-[11px] font-medium transition-all select-none shrink-0 active:scale-95",
          config.mode === "300mb_saver" || config.mode === "auto"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
            : config.mode === "150mb_ultra"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
          className,
        )}
        title="Mobile Data Saver: 300 MB/hr Max"
        aria-label="Configure Data Saver"
      >
        <Gauge className="size-3.5 animate-pulse text-emerald-500 shrink-0" />
        <span className="font-semibold tracking-tight">
          {config.mode === "300mb_saver"
            ? "300MB/h"
            : config.mode === "150mb_ultra"
              ? "150MB/h"
              : config.mode === "auto"
                ? "Auto 300MB/h"
                : "Full HD"}
        </span>
        <ChevronDown className="size-3 opacity-60 group-hover:opacity-100 shrink-0" />
      </button>

      {/* Settings Bottom Sheet / Modal for Mobile & Desktop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          {/* Backdrop Click Dismiss */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} aria-hidden="true" />

          <div
            className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-2xl text-foreground animate-in slide-in-from-bottom duration-300 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-saver-title"
          >
            {/* Mobile Sheet Pull Handle Bar */}
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="grid size-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <h3
                    id="data-saver-title"
                    className="font-display text-base font-semibold leading-tight"
                  >
                    Mobile Data & Bitrate Limit
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Enforces strict 300 MB/hr bandwidth ceilings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-10 place-items-center rounded-full bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition active:scale-95 shrink-0"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Live Session Telemetry Card */}
            <div className="my-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Activity className="size-3.5" /> Live Session Telemetry
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface/90 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium block">
                    Session Used
                  </span>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold">
                    {formatBytes(stats.sessionBytesUsed)}
                  </p>
                </div>
                <div className="rounded-xl bg-surface/90 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium block">
                    Rate Limit
                  </span>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    ≤ {config.maxBitrateKbps} kbps
                  </p>
                </div>
                <div className="rounded-xl bg-surface/90 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium block">
                    Data Saved
                  </span>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold text-primary">
                    ~{stats.savingsPercent}%
                  </p>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground leading-snug">
                Cap: <strong>300 MB/hour</strong> (~83.3 KB/s). Video buffer capped at 8s.
              </p>
            </div>

            {/* Mode selection options */}
            <div className="space-y-2">
              {modes.map((item) => {
                const active = config.mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode(item.id);
                    }}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-surface hover:bg-secondary/50",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 group-hover:border-muted-foreground",
                      )}
                    >
                      {active ? <Check className="size-3 stroke-[3]" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground leading-tight">
                          {item.label}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shrink-0",
                            active
                              ? "bg-primary/20 text-primary"
                              : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {item.tag}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer Done button */}
            <div className="mt-5 pt-3 border-t border-border/60 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full sm:w-auto rounded-2xl bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition active:scale-95 hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
