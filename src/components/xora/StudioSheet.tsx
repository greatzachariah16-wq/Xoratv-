import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type StudioTabId = "manage" | "analytics" | "earnings" | "referrals" | "payout" | "customize";

type StudioSheetProps = {
  open: boolean;
  tabs: Array<[StudioTabId, string]>;
  onOpenChange(open: boolean): void;
  onSelect(tab: StudioTabId): void;
};

export function StudioSheet({ open, tabs, onOpenChange, onSelect }: StudioSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border-border bg-surface p-5 text-foreground sm:rounded-[28px]">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl">Manage your X Channel</SheetTitle>
          <SheetDescription>Choose a creator workspace to continue.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {tabs.map(([id, label]) => <button type="button" key={id} onClick={() => onSelect(id)} className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-background px-4 text-left text-sm font-semibold transition hover:border-primary/30 hover:bg-primary/5">{label}<span className="text-primary">→</span></button>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
