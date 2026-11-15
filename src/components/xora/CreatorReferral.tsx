import { useState } from "react";
import { Check, ChevronDown, Copy, Link2, MessageCircle, Plus, Share2, Users, Clock3, BadgeCheck } from "lucide-react";

export type ReferralMember = {
  referredUserId: string;
  registeredAt?: string | null;
  qualifiedAt?: string | null;
  successfulClaims?: number | string | null;
  amount?: number | string | null;
};

type ReferralStatsProps = {
  visits: number;
  pending: number;
  eligible: number;
  earned: string;
  activeMembers: number;
};

export function ReferralStats({ visits, pending, eligible, earned, activeMembers }: ReferralStatsProps) {
  const stats = [
    { label: "Link visits", value: visits.toLocaleString() },
    { label: "Pending", value: pending.toLocaleString() },
    { label: "Eligible", value: eligible.toLocaleString() },
    { label: "Earned", value: earned, featured: true },
  ];
  return <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-3">
    {stats.map((stat) => <div key={stat.label} className={`flex min-h-[88px] min-w-0 flex-col justify-center rounded-[20px] border border-border p-4 shadow-card ${stat.featured ? "border-primary/20 bg-primary/10" : "bg-surface"}`}>
      <p className="text-xs leading-4 text-muted-foreground">{stat.label}</p>
      <p className={`mt-1 break-words text-2xl font-semibold tabular-nums ${stat.featured ? "text-primary" : "text-foreground"}`}>{stat.value}</p>
    </div>)}
    <div className="col-span-2 flex min-w-0 items-center justify-between gap-3 rounded-[20px] border border-border bg-surface px-4 py-3 shadow-card">
      <div className="min-w-0"><p className="text-sm font-semibold">Active members</p><p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">Members who have claimed free data 3 times.</p></div>
      <p className="shrink-0 text-lg font-semibold tabular-nums">{activeMembers.toLocaleString()}</p>
    </div>
  </div>;
}

type InviteLinkCardProps = {
  url: string;
  busy: boolean;
  onCreate: () => void;
};

export function InviteLinkCard({ url, busy, onCreate }: InviteLinkCardProps) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else window.prompt("Copy your XoraTV invite link", url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your XoraTV invite link", url);
    }
  }
  async function shareLink() {
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join me on XoraTV", text: "Join me on XoraTV", url }); }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    } else {
      await copyLink();
    }
  }
  function shareWhatsApp() {
    if (!url) return;
    window.open("https://wa.me/?text=" + encodeURIComponent("Join me on XoraTV: " + url), "_blank", "noopener,noreferrer");
  }
  return <section className="w-full min-w-0 max-w-full rounded-[28px] border border-border bg-surface p-5 shadow-card">
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Users className="size-5"/></span>
      <div className="min-w-0 flex-1"><h3 className="text-[17px] font-semibold">Your invite link</h3><p className="mt-1 break-words text-[15px] leading-[1.5] text-muted-foreground">One link you can share anywhere. People who open it go straight to XoraTV sign-up.</p></div>
    </div>
    {url ? <>
      <div className="mt-4 flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background p-1.5">
        <Link2 className="ml-2 size-4 shrink-0 text-muted-foreground"/>
        <span title={url} className="min-w-0 flex-1 truncate text-sm">{url}</span>
        <button type="button" onClick={() => void copyLink()} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-semibold" aria-label="Copy invite link">{copied ? <Check className="size-4"/> : <Copy className="size-4"/>}{copied ? "Copied" : "Copy"}</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void shareLink()} className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground"><Share2 className="size-4"/>Share</button>
        <button type="button" onClick={shareWhatsApp} className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground"><MessageCircle className="size-4"/>WhatsApp</button>
      </div>
    </> : <>
      <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">Your link will appear here once you create it.</p>
      <button type="button" onClick={onCreate} disabled={busy} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <span className="animate-spin">◌</span> : <Plus className="size-4"/>}{busy ? "Creating link…" : "Create invite link"}</button>
    </>}
  </section>;
}

type ReferralListProps = {
  pending: ReferralMember[];
  eligible: ReferralMember[];
};

export function ReferralList({ pending, eligible }: ReferralListProps) {
  const [active, setActive] = useState<"pending" | "eligible">("pending");
  const selected = active === "pending" ? pending : eligible;
  return <section className="w-full min-w-0 max-w-full rounded-[28px] border border-border bg-surface p-5 shadow-card">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h3 className="text-[17px] font-semibold">Your referrals</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Follow each referral as they get started.</p></div>
      <div role="group" aria-label="Referral status" className="inline-flex max-w-full rounded-full border border-border bg-background p-1">
        <button type="button" aria-pressed={active === "pending"} onClick={() => setActive("pending")} className={`min-h-10 rounded-full px-3 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${active === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Pending ({pending.length})</button>
        <button type="button" aria-pressed={active === "eligible"} onClick={() => setActive("eligible")} className={`min-h-10 rounded-full px-3 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${active === "eligible" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Eligible ({eligible.length})</button>
      </div>
    </div>
    {selected.length ? <div className="mt-4 space-y-2">
      {selected.map((item) => <div key={item.referredUserId} className="flex min-w-0 items-center justify-between gap-3 rounded-[20px] border border-border bg-background p-4">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">Member · {String(item.referredUserId).slice(-6)}</p>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{active === "pending" ? `Registered ${item.registeredAt ? new Date(item.registeredAt).toLocaleDateString() : "date unavailable"}` : `Qualified ${item.qualifiedAt ? new Date(item.qualifiedAt).toLocaleDateString() : "date unavailable"} · ${Number(item.successfulClaims || 0)} successful claims`}</p></div>
        {active === "pending" ? <span className="shrink-0 rounded-full border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary">Pending</span> : <span className="shrink-0 rounded-full border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary">₦{Number(item.amount || 50).toLocaleString("en-NG")}</span>}
      </div>)}
    </div> : <div className="mt-4 rounded-2xl border border-dashed border-border px-3 py-6 text-center">
      {active === "pending" ? <Clock3 className="mx-auto size-5 text-muted-foreground"/> : <BadgeCheck className="mx-auto size-5 text-muted-foreground"/>}
      <p className="mt-2 break-words text-sm leading-5 text-muted-foreground">{active === "pending" ? "No pending referrals yet. New sign-ups will show up here." : "No eligible referrals yet. They appear after a friend's first free data arrives."}</p>
    </div>}
  </section>;
}

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  return <section className="w-full min-w-0 max-w-full rounded-[28px] border border-border bg-surface p-5 shadow-card">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 text-left">
      <span className="text-[17px] font-semibold">How it works</span>
      <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}/>
    </button>
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <div className="min-h-0 overflow-hidden">
        <ol className="mt-4 space-y-4">
          <li className="flex min-w-0 items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">1</span><p className="min-w-0 break-words text-[15px] leading-[1.5]">Share your link. Your friend signs up on XoraTV.</p></li>
          <li className="flex min-w-0 items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">2</span><p className="min-w-0 break-words text-[15px] leading-[1.5]">They get their first free data. You earn ₦50, once per friend.</p></li>
        </ol>
        <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">Minimum withdrawal: ₦500.</p>
      </div>
    </div>
  </section>;
}
