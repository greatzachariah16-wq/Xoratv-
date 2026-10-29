import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Gift, Globe2, RadioTower, Router,
  Smartphone, Sparkles, X, Zap,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/special-prizes")({
  head: () => ({
    meta: [
      { title: "Special Prizes — XoraTV" },
      { name: "description", content: "Explore featured promotions and special offers on XoraTV." },
    ],
  }),
  component: SpecialPrizesPage,
});

type PrizeCategory = "Featured" | "Mobile Offers" | "Devices" | "Data & Connectivity";
type PrizeOffer = {
  id: string;
  title: string;
  provider: string;
  category: Exclude<PrizeCategory, "Featured">;
  description: string;
  badge: string;
  icon: typeof Gift;
  art: string;
};

const categories: PrizeCategory[] = ["Featured", "Mobile Offers", "Devices", "Data & Connectivity"];
const offers: PrizeOffer[] = [
  { id: "mtn-connect", title: "Stay connected with MTN", provider: "MTN", category: "Data & Connectivity", description: "Explore a featured connectivity promotion and check the provider's eligibility details.", badge: "Connectivity", icon: RadioTower, art: "from-primary/25 via-clay-soft to-accent" },
  { id: "glo-data", title: "Discover Glo offers", provider: "Glo", category: "Mobile Offers", description: "See what this mobile promotion includes before continuing to the provider.", badge: "Mobile offer", icon: Smartphone, art: "from-sage/25 via-secondary to-accent" },
  { id: "4g-router", title: "Explore 4G router offers", provider: "Device promotions", category: "Devices", description: "Browse device-related promotions and review the terms supplied by each advertiser.", badge: "Device", icon: Router, art: "from-clay-soft via-primary/10 to-secondary" },
  { id: "mobile-entertainment", title: "Mobile entertainment", provider: "Entertainment offers", category: "Mobile Offers", description: "Explore mobile entertainment offers. Availability and eligibility depend on the provider.", badge: "Entertainment", icon: Zap, art: "from-accent via-primary/10 to-clay-soft" },
  { id: "network-options", title: "Compare connectivity options", provider: "Network promotions", category: "Data & Connectivity", description: "Review available connectivity promotions and their individual terms.", badge: "Connectivity", icon: Globe2, art: "from-secondary via-sage/15 to-primary/10" },
];

function SpecialPrizesPage() {
  const [category, setCategory] = useState<PrizeCategory>("Featured");
  const [activeOffer, setActiveOffer] = useState<PrizeOffer | null>(null);
  const visibleOffers = useMemo(
    () => category === "Featured" ? offers : offers.filter((offer) => offer.category === category),
    [category],
  );

  return (
    <AppShell wide>
      <main id="main" className="mx-auto w-full max-w-5xl space-y-6 pb-8">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="press inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground">
            <ArrowLeft className="size-4" /> <span>Home</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Sparkles className="size-4" /></span>
            <span className="text-sm font-bold tracking-tight">XoraTV</span>
          </div>
        </header>

        <section className="relative isolate overflow-hidden rounded-[30px] border border-border bg-ink px-5 py-7 text-white shadow-lift sm:px-8 sm:py-10">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/75 via-ink to-sage/35" />
          <div aria-hidden="true" className="absolute -right-12 -top-16 size-56 rounded-full border border-white/10 bg-white/5 blur-2xl" />
          <div aria-hidden="true" className="absolute bottom-[-70px] right-[16%] size-48 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative grid items-center gap-6 sm:grid-cols-[1.2fr_.8fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-white/90">
                <Sparkles className="size-3.5" /> XoraTV promotions
              </span>
              <h1 className="mt-4 max-w-lg font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Special Prizes</h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/75 sm:text-base">Discover featured mobile offers, devices, and connectivity promotions in one place.</p>
              <p className="mt-5 text-xs text-white/55">Promotional offers · Terms vary by provider</p>
            </div>
            <div aria-hidden="true" className="relative mx-auto grid aspect-square w-full max-w-[210px] place-items-center sm:max-w-[240px]">
              <div className="absolute inset-2 rotate-6 rounded-[34px] border border-white/15 bg-white/5" />
              <div className="absolute inset-5 -rotate-6 rounded-[30px] border border-white/15 bg-gradient-to-br from-white/15 to-white/[.03]" />
              <div className="relative grid size-24 place-items-center rounded-[28px] border border-white/25 bg-white/10 shadow-2xl backdrop-blur"><Gift className="size-12 text-white" strokeWidth={1.4} /></div>
              <Sparkles className="absolute right-5 top-5 size-7 text-white/80" />
              <Sparkles className="absolute bottom-5 left-5 size-5 text-white/65" />
            </div>
          </div>
        </section>

        <section aria-label="Offer categories" className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item}
              className={"press min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors " + (category === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {item}
            </button>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Handpicked for you</p><h2 className="mt-1 font-display text-2xl font-bold">{category === "Featured" ? "Featured promotions" : category}</h2></div>
            <span className="text-xs text-muted-foreground">{visibleOffers.length} offers</span>
          </div>
          {category === "Featured" && (
            <button type="button" onClick={() => setActiveOffer(offers[0])} className="group relative grid w-full overflow-hidden rounded-[26px] border border-border bg-surface text-left shadow-card transition hover:border-primary/40 sm:grid-cols-[.95fr_1.05fr]">
              <div className="relative flex min-h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 via-clay-soft to-secondary p-6 sm:min-h-[220px]">
                <div className="absolute inset-4 rounded-[22px] border border-white/60" />
                <div className="relative grid size-24 place-items-center rounded-[28px] border border-white/70 bg-background/70 text-primary shadow-lift"><RadioTower className="size-12" strokeWidth={1.4} /></div>
                <span className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Featured</span>
              </div>
              <div className="flex flex-col justify-center p-5 sm:p-7"><span className="text-xs font-semibold text-primary">Connectivity · MTN</span><h3 className="mt-2 font-display text-2xl font-bold leading-tight">Discover today's featured offer</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Explore the promotion, review the details, and check the provider's terms before continuing.</p><span className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">View offer <ArrowRight className="size-4" /></span></div>
            </button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleOffers.map((offer) => {
              const Icon = offer.icon;
              return <article key={offer.id} className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-card transition hover:border-primary/35">
                <div className={"relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br " + offer.art}>
                  <div className="absolute inset-3 rounded-[18px] border border-white/50" />
                  <span className="grid size-16 place-items-center rounded-[22px] border border-white/70 bg-background/70 text-primary shadow-card"><Icon className="size-8" strokeWidth={1.5} /></span>
                  <span className="absolute left-4 top-4 rounded-full border border-white/70 bg-background/80 px-3 py-1 text-[10px] font-semibold text-foreground">{offer.badge}</span>
                </div>
                <div className="p-4"><p className="text-[11px] font-semibold text-primary">{offer.provider}</p><h3 className="mt-1 font-display text-lg font-bold">{offer.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{offer.description}</p><button type="button" onClick={() => setActiveOffer(offer)} className="press mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold hover:border-primary/40 hover:bg-accent">View details <ArrowRight className="size-4" /></button></div>
              </article>;
            })}
          </div>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">Promotional offers. Availability, eligibility and terms depend on the individual provider. Viewing an offer does not guarantee a prize or reward.</p>
        </section>

        <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><BadgeCheck className="size-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Simple and clear</p><h2 className="font-display text-xl font-bold">How it works</h2></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[["01", "Explore a promotion", "Browse the featured offers and find one that interests you."], ["02", "Review the details", "Check the provider, eligibility and terms before proceeding."], ["03", "Continue to the provider", "Follow the official offer flow and its instructions."]].map(([n, title, body]) => <div key={n} className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-sm font-bold text-primary">{n}</span><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div></div>)}
          </div>
        </section>
      </main>

      {activeOffer && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveOffer(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="special-prize-dialog-title" className="rise max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-border bg-background shadow-lift sm:rounded-[28px]">
          <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 via-clay-soft to-secondary"><div className="grid size-20 place-items-center rounded-[24px] border border-white/70 bg-background/80 text-primary shadow-card"><activeOffer.icon className="size-10" /></div><button type="button" onClick={() => setActiveOffer(null)} aria-label="Close offer details" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-white/70 bg-background/90 text-foreground"><X className="size-4" /></button></div>
          <div className="space-y-4 p-5 sm:p-6"><p className="text-xs font-semibold text-primary">{activeOffer.provider} · {activeOffer.category}</p><h2 id="special-prize-dialog-title" className="font-display text-2xl font-bold">{activeOffer.title}</h2><p className="text-sm leading-6 text-muted-foreground">{activeOffer.description}</p><div className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold">Before you continue</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Check the offer's eligibility, costs (if any), and terms on the provider's official page. This preview uses sample offers; no external offer is connected yet.</p></div><button type="button" onClick={() => setActiveOffer(null)} className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">Got it <ArrowRight className="size-4" /></button></div>
        </section>
      </div>}
    </AppShell>
  );
}
