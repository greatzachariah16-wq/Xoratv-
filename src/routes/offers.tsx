import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, Info, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/offers")({ component: OfferWall });

type Offer = {
  id: string;
  title: string;
  description: string;
  points: number;
  imageUrl: string | null;
  offerUrl: string;
  offerType: string | null;
};

function OfferWall() {
  const { user } = useAuth();
  const search = useSearch({ from: "/offers" }) as { promo?: string; offer?: string };
  const [offers, setOffers] = useState<Offer[]>([]);
  const [points, setPoints] = useState(0);
  const [trackingId, setTrackingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadOffers() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ userId: user.id });
      if (search.promo) params.set("promo", search.promo);
      if (search.offer) params.set("offer", search.offer);
      const data = await commerceFetch<{ offers?: Offer[]; points?: number; trackingId?: string; error?: string }>(
        `/api/offers?${params.toString()}`,
      );
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      setPoints(Number(data.points || 0));
      setTrackingId(String(data.trackingId || ""));
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load offers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOffers();
  }, [user?.id, search.promo, search.offer]);

  async function startOffer(offer: Offer) {
    if (!user || !trackingId) {
      await loadOffers();
      return;
    }

    setStarted(offer.id);
    setError("");
    try {
      await commerceFetch("/api/offers/click", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          trackingId,
          offerId: offer.id,
          offerTitle: offer.title,
          promo: search.promo || null,
        }),
      });
      window.open(offer.offerUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this offer.");
    } finally {
      setStarted(null);
    }
  }

  if (!user) {
    return (
      <AppShell wide>
        <div className="mx-auto max-w-[390px] rounded-[28px] border border-border bg-surface p-7 text-center shadow-card">
          <Gift className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 font-display text-3xl font-semibold">Earn Xora Points</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sign in to complete eligible offers and keep your points tied to your Xora account.
          </p>
          <Link to="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <main className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-card">
        <section className="mx-4 mt-4 h-[154px] overflow-hidden rounded-[24px] bg-primary px-5 py-0 text-primary-foreground shadow-lift">
          <div className="relative h-full">
            <p className="absolute left-0 top-[22px] text-[15px] font-semibold">Xora Points</p>
            <p className="absolute left-0 top-[60px] font-display text-[36px] font-extrabold leading-none">
              {points.toLocaleString()} XP
            </p>
            <p className="absolute left-0 top-[108px] text-[13px] opacity-90">
              Complete eligible offers to earn points
            </p>
            <button
              type="button"
              onClick={() => document.getElementById("use-points")?.scrollIntoView({ behavior: "smooth" })}
              className="absolute right-[20px] top-[108px] h-[34px] rounded-full bg-primary-foreground px-[18px] text-[12px] font-semibold text-primary press"
            >
              Use points
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2 overflow-hidden border-b border-border/60 px-5 pb-4 pt-6">
          <h1 className="font-display text-[22px] font-extrabold leading-none">Earn Xora Points</h1>
          <p className="text-[13px] text-muted-foreground">
            Choose an offer below. Rewards are credited after CPAGrip confirms completion.
          </p>
        </section>

        <section className="flex min-h-[120px] flex-col gap-3 overflow-hidden px-5 pb-5 pt-4">
          {error ? (
            <div className="rounded-[18px] border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {loading && !offers.length ? (
            <>
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-[104px] animate-pulse rounded-[18px] bg-surface-2" />
              ))}
            </>
          ) : null}

          {!loading && !offers.length && !error ? (
            <div className="rounded-[18px] border border-dashed border-border bg-surface p-6 text-center">
              <Gift className="mx-auto size-8 text-primary" />
              <p className="mt-3 text-sm font-semibold">No eligible offers right now</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                CPAGrip controls offer availability by country, device and campaign eligibility.
              </p>
            </div>
          ) : null}

          {offers.map((offer) => (
            <article key={offer.id} className="relative min-h-[116px] overflow-hidden rounded-[20px] border border-border/60 bg-surface px-4 pt-4 shadow-card">
              <div className="flex gap-3">
                {offer.imageUrl ? (
                  <img
                    src={offer.imageUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary">
                    <Gift className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pr-[100px]">
                  <h2 className="truncate text-[16px] font-semibold text-foreground">{offer.title}</h2>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                    {offer.description || "Complete the advertiser's stated requirement to receive Xora Points."}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-3 left-4 flex max-w-[150px] flex-wrap gap-1.5">
                <span className="rounded-full bg-clay-soft px-3 py-1 text-[12px] font-semibold text-foreground">
                  +{Number(offer.points).toLocaleString()} XP
                </span>
                {offer.offerType ? (
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                    {offer.offerType}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void startOffer(offer)}
                disabled={started === offer.id || !trackingId}
                className="absolute bottom-3 right-4 inline-flex h-[34px] items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground press disabled:opacity-60"
              >
                {started === offer.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                {started === offer.id ? "Opening…" : "Start offer"}
              </button>
            </article>
          ))}

          <button
            type="button"
            onClick={() => void loadOffers()}
            disabled={loading}
            className="mx-auto inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground press"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {loading ? "Refreshing…" : "Refresh offers"}
          </button>
        </section>

        <section id="use-points" className="flex min-h-[180px] flex-col gap-2 overflow-hidden border-t border-border/60 px-5 pb-5 pt-6">
          <h2 className="font-display text-[19px] font-extrabold">Use your points</h2>
          <div className="flex h-[92px] gap-2.5 overflow-x-auto rounded-[18px] border border-border/60 bg-surface-2 p-1.5">
            <div className="flex h-[82px] w-[110px] shrink-0 flex-col justify-between rounded-[16px] bg-surface px-3 py-2">
              <Sparkles className="size-4 text-primary" />
              <div><p className="text-[14px] font-semibold">Data</p><p className="text-[11px] text-muted-foreground">Discounts</p></div>
            </div>
            <div className="flex h-[82px] w-[110px] shrink-0 flex-col justify-between rounded-[16px] bg-surface px-3 py-2">
              <ShieldCheck className="size-4 text-primary" />
              <div><p className="text-[14px] font-semibold">Courses</p><p className="text-[11px] text-muted-foreground">Unlock access</p></div>
            </div>
            <div className="flex h-[82px] w-[110px] shrink-0 flex-col justify-between rounded-[16px] bg-surface px-3 py-2">
              <Info className="size-4 text-primary" />
              <div><p className="text-[14px] font-semibold">More</p><p className="text-[11px] text-muted-foreground">Coming later</p></div>
            </div>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            1 XP is currently worth ₦0.10. Points can cover up to 50% of a data purchase or fully unlock a course when you have enough XP.
          </p>
        </section>

        <section className="mx-4 mb-6 rounded-[22px] border border-border/50 bg-clay-soft p-4 shadow-card">
          <p className="text-[16px] font-semibold">Creator offer promotion</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Creators can promote eligible offers using XoraTV links and earn 35% of the CPAGrip payout on approved referred conversions, subject to the 200-conversion payout threshold and settlement.
          </p>
          <Link
            to="/creator-studio"
            className="mt-4 inline-flex h-[30px] items-center rounded-full bg-primary px-4 text-[11px] font-semibold text-primary-foreground press"
          >
            Creator Studio
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
