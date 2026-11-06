import { cn } from "@/lib/utils";

type XSeriesMarkProps = { size?: "sm" | "md" | "lg"; className?: string };

export function XSeriesMark({ size = "md", className }: XSeriesMarkProps) {
  const dimensions = size === "sm" ? "size-10 rounded-xl" : size === "lg" ? "size-16 rounded-[1.35rem]" : "size-12 rounded-2xl";
  const iconSize = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-8";

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center border border-[#e6c992]/55 bg-[linear-gradient(145deg,#f3dfb8_0%,#c99b5f_48%,#76502d_100%)] p-[1px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.75),0_8px_20px_rgba(0,0,0,0.22)]",
        dimensions,
        className,
      )}
      aria-hidden="true"
    >
      <span className="grid size-full place-items-center rounded-[inherit] border border-[#5b3b22]/60 bg-[radial-gradient(circle_at_35%_20%,#443126_0%,#211813_66%,#120f0d_100%)]">
        <svg viewBox="0 0 64 64" className={iconSize} fill="none">
          <path d="M12 18.5 17 9h30l5 9.5" stroke="#e7c58c" strokeWidth="2.8" strokeLinejoin="round" />
          <path d="M16 10.5 21 18M27 10.5 32 18M38 10.5 43 18" stroke="#7b5835" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="9.5" y="19" width="45" height="36" rx="6.5" fill="#d0a66b" fillOpacity=".13" stroke="#dfbd83" strokeWidth="2.4" />
          <rect x="15" y="24.5" width="34" height="25" rx="3" fill="#100e0d" stroke="#9c7549" strokeWidth="1.2" />
          <path d="m27 29.5 12.5 7.7L27 45V29.5Z" fill="#f0d6a7" />
          <path d="M13 55h38" stroke="#f0d6a7" strokeOpacity=".7" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );
}