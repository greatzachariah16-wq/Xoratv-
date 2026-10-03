import { useEffect, useRef, useState } from "react";
import { isAdcashEnabled } from "@/lib/adcash";

const ZONE_ID = "12261762";

type AdcashWindow = Window & {
  aclib?: {
    runBanner: (options: { zoneId: string }) => void;
  };
};

export function AdcashBanner({
  className = "",
  delayMs = 0,
}: {
  className?: string;
  delayMs?: number;
}) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isAdcashEnabled()) return;
    setEnabled(true);

    const slot = slotRef.current;
    if (!slot) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const run = () => {
      if (!isAdcashEnabled() || !slotRef.current) return;
      const aclib = (window as AdcashWindow).aclib;
      if (aclib?.runBanner) {
        aclib.runBanner({ zoneId: ZONE_ID });
        return;
      }

      attempts += 1;
      if (attempts < 30) {
        timer = setTimeout(run, 500);
      }
    };

    timer = setTimeout(run, delayMs);

    const sync = () => {
      const next = isAdcashEnabled();
      setEnabled(next);
      if (!next && slotRef.current) slotRef.current.replaceChildren();
    };

    window.addEventListener("xora:adcash-toggle", sync);
    window.addEventListener("storage", sync);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("xora:adcash-toggle", sync);
      window.removeEventListener("storage", sync);
    };
  }, [delayMs]);

  if (!enabled) return null;

  return (
    <div className={`w-full flex justify-center overflow-hidden ${className}`} aria-label="Advertisement">
      <div ref={slotRef} className="w-full max-w-[728px] min-h-0 flex justify-center" />
    </div>
  );
}

export function AdcashCinemaBanner({
  delayMs = 5000,
  className = "",
}: {
  delayMs?: number;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAdcashEnabled()) return;

    const handlePlay = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLVideoElement)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (isAdcashEnabled()) setShow(true);
      }, delayMs);
    };

    document.addEventListener("play", handlePlay, true);

    const sync = () => {
      if (!isAdcashEnabled()) {
        setShow(false);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };

    window.addEventListener("xora:adcash-toggle", sync);
    window.addEventListener("storage", sync);

    return () => {
      document.removeEventListener("play", handlePlay, true);
      window.removeEventListener("xora:adcash-toggle", sync);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [delayMs]);

  if (!show || !isAdcashEnabled()) return null;

  return (
    <div
      className={`mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-xl backdrop-blur-md sm:p-3 ${className}`}
      aria-label="Cinema advertisement"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35">
          Sponsored
        </span>
      </div>
      <AdcashBanner className="min-h-[50px]" />
    </div>
  );
}
