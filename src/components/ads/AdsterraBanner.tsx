import { useEffect, useRef, useState } from "react";

const AD_KEY = "8e898239b8c0642683edb14583752967";
const AD_SCRIPT = `https://www.highrevenueformat.com/${AD_KEY}/invoke.js`;

export function AdsterraBanner({ className = "" }: { className?: string }) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px 0px", threshold: 0.01 },
    );

    observer.observe(slot);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !inView || loaded) return;

    const options = {
      key: AD_KEY,
      format: "iframe",
      height: 250,
      width: 300,
      params: {},
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = AD_SCRIPT;
    script.dataset.adsterra = AD_KEY;

    // The banner is requested once when this individual slot approaches view.
    (window as Window & { atOptions?: typeof options }).atOptions = options;
    slot.appendChild(script);
    setLoaded(true);

    return () => {
      // Do not remove/re-request an ad on every scroll in/out of view.
      // This avoids artificial refreshes and repeated impression requests.
    };
  }, [inView, loaded]);

  return (
    <div className={`my-4 flex w-full justify-center ${className}`}>
      <div
        ref={slotRef}
        className="flex min-h-[250px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-surface/40"
        aria-label="Advertisement"
      />
    </div>
  );
}
