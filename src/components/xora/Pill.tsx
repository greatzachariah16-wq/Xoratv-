import type { ComponentPropsWithoutRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export type PillVariant = "solid" | "soft" | "outline";

interface PillProps extends ComponentPropsWithoutRef<"button"> {
  asChild?: boolean;
  variant?: PillVariant;
}

const variants: Record<PillVariant, string> = {
  solid: "bg-primary text-primary-foreground hover:bg-primary/90",
  soft: "bg-primary/10 text-primary hover:bg-primary/15",
  outline:
    "border border-primary/20 bg-card text-foreground hover:border-primary/45 hover:text-primary",
};

export function Pill({ asChild = false, variant = "soft", className, ...props }: PillProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      {...props}
      className={cn(
        "press inline-flex h-11 min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold leading-none transition-colors",
        variants[variant],
        className,
      )}
    />
  );
}
