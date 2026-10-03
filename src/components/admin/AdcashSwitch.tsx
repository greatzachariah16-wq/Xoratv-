import { useEffect, useState } from "react";
import { Check, Power } from "lucide-react";
import { isAdcashEnabled, setAdcashEnabled } from "@/lib/adcash";

export function AdcashSwitch() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const sync = () => setEnabled(isAdcashEnabled());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("xora:adcash-toggle", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("xora:adcash-toggle", sync);
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setAdcashEnabled(next);
    setEnabled(next);
  };

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-primary">
            <Power className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Adcash</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Master switch for Adcash placements. Pause them instantly when needed.
            </p>
          </div>
        </div>
        <button type="button" role="switch" aria-checked={enabled} onClick={toggle}
          className={enabled ? "relative h-8 w-14 rounded-full bg-primary p-1" : "relative h-8 w-14 rounded-full bg-secondary p-1"}>
          <span className={enabled ? "grid size-6 translate-x-6 place-items-center rounded-full bg-white shadow-sm" : "grid size-6 place-items-center rounded-full bg-white shadow-sm"}>
            {enabled ? <Check className="size-3.5 text-primary" /> : null}
          </span>
        </button>
      </div>
      <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        Status: <span className={enabled ? "text-emerald-600" : "text-rose-600"}>{enabled ? "Enabled" : "Paused"}</span>
      </div>
    </section>
  );
}
