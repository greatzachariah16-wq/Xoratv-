import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="rise mx-auto flex max-w-sm flex-col items-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-sm flex-col items-center rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center"
    >
      <h2 className="font-display text-base font-semibold text-foreground">
        Something didn&apos;t load
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="press mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
