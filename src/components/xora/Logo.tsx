import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[1.35rem] font-bold leading-none tracking-tight text-foreground",
        className,
      )}
    >
      <span className="text-primary">x</span>ora
    </span>
  );
}
