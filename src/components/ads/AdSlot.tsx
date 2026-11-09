import { cloneElement, isValidElement, useState, type ReactNode } from "react";

const PREVIEW_NO_ADS = import.meta.env.VITE_PREVIEW_NO_ADS === "true";

interface AdSlotChildProps {
  onLoad?: () => void;
  onError?: () => void;
}

export interface AdSlotProps {
  children: ReactNode;
  height?: number;
  label?: string;
}

export function AdSlot({ children, height = 96, label = "Sponsored" }: AdSlotProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (PREVIEW_NO_ADS || !isValidElement<AdSlotChildProps>(children)) return null;

  const ad = cloneElement(children, {
    onLoad: () => setLoaded(true),
    onError: () => setFailed(true),
  });

  return (
    <section
      aria-label={label}
      aria-hidden={failed}
      className="w-full min-w-0 overflow-hidden transition-[height,opacity,margin] duration-200 ease-out"
      style={{
        height: failed ? 0 : height,
        marginBlock: failed ? 0 : 24,
        opacity: failed ? 0 : 1,
      }}
    >
      {!failed ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
          <div
            className="relative flex w-full items-center justify-center overflow-hidden rounded-[20px] border border-[color:var(--xora-line)] bg-card"
            style={{ height: Math.max(height - 20, 1) }}
          >
            {!loaded ? (
              <div
                aria-hidden="true"
                className="shimmer absolute inset-0 rounded-[20px]"
              />
            ) : null}
            <div className="relative z-10 flex max-w-full items-center justify-center">
              {ad}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
