import { useState } from "react";
import { Gauge, Wifi, Smartphone, Check, Zap, Activity, ChevronDown, X } from "lucide-react";
import { useDataSaver, type DataSaverMode } from "@/lib/data-saver";
import { cn } from "@/lib/utils";

export function DataSaverBadge({ className }: { className?: string }) {
  const { config, stats, setMode } = useDataSaver();
  const [isOpen, setIsOpen] = useState(false);

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
          "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all select-none",
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
        <Gauge className="size-3.5 animate-pulse text-emerald-500" />
        <span className="font-semibold tracking-tight">
          {config.mode === "300mb_saver"
            ? "300MB/h Max"
            : config.mode === "150mb_ultra"
              ? "150MB/h Ultra"
              : config.mode === "auto"
                ? "Auto 300MB/h"
                : "Full HD"}
        </span>
        <ChevronDown className="size-3 opacity-60 group-hover:opacity-100" />
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-2xl text-foreground"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-saver-title"
          >
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <h3 id="data-saver-title" className="font-display text-base font-semibold">
                    Mobile Data Usage & Optimization
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Enforces strict streaming bandwidth ceilings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-8 place-items-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Live Session Telemetry Card */}
            <div className="my-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Activity className="size-3.5" /> Live Data Telemetry
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface/80 p-2.5 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                    Session Used
                  </span>
                  <p className="mt-0.5 text-sm font-bold">{formatBytes(stats.sessionBytesUsed)}</p>
                </div>
                <div className="rounded-xl bg-surface/80 p-2.5 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                    Data Rate
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    ≤ {config.maxBitrateKbps} kbps
                  </p>
                </div>
                <div className="rounded-xl bg-surface/80 p-2.5 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                    Data Saved
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-primary">~{stats.savingsPercent}%</p>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Ceiling: <strong>300 MB/hour</strong> (~83.3 KB/s stream rate). Stream buffer capped
                at 8 seconds.
              </p>
            </div>

            {/* Mode selection options */}
            <div className="space-y-2.5">
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
                      "group flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition",
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{item.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
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

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
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
