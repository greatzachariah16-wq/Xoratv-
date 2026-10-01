import { useEffect, useRef } from "react";

const AD_KEY = "8e898239b8c0642683edb14583752967";
const AD_SCRIPT = `https://www.highrevenueformat.com/${AD_KEY}/invoke.js`;

export function AdsterraBanner({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.dataset.loaded === "true") return;

    // Adsterra's supplied banner configuration is scoped to this one placement.
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

    (window as Window & { atOptions?: typeof options }).atOptions = options;
    container.dataset.loaded = "true";
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete container.dataset.loaded;
    };
  }, []);

  return (
    <div className={`my-4 flex w-full justify-center ${className}`}>
      <div
        ref={containerRef}
        className="flex min-h-[250px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-surface/40"
        aria-label="Advertisement"
      />
    </div>
  );
}
