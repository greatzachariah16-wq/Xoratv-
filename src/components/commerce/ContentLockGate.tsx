import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

type Props = {
  enabled?: boolean;
  unlocked?: boolean;
  children: ReactNode;
  title?: string;
  description?: string;
};

export function ContentLockGate({
  enabled = false,
  unlocked = false,
  children,
  title = "Content access",
  description = "This content can be connected to Xora's CPA content-locking system when the campaign is configured.",
}: Props) {
  // The gate is intentionally disabled for the current launch. The CPA provider,
  // offer and postback rules will be supplied later and wired into this boundary.
  if (!enabled || unlocked) return <>{children}</>;

  return (
    <section className="rounded-3xl border border-primary/15 bg-primary/5 p-6 text-center">
      <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
        <LockKeyhole className="size-5" />
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
