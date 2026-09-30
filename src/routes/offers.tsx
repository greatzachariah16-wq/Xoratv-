import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Gift, Info, Loader2, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/offers")({ component: OfferWall });

function OfferWall() {
  const { user } = useAuth();
  const search = useSearch({ from: "/offers" }) as { promo?: string; offer?: string };
  const [offers, setOffers] = useState<any[]>([]);
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
      const data = await commerceFetch<any>(
        `/api/offers?userId=${encodeURIComponent(user.id)}${search.promo ? `&promo=${encodeURIComponent(search.promo)}` : ""}${search.offer ? `&offer=${encodeURIComponent(search.offer)}` : ""}`,
      );
      setOffers(data.offers || []);
      setPoints(Number(data.points || 0));
      setTrackingId(String(data.trackingId || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load offers.");
    } finally {
      setLoading(false);
    }
  }

  async function startOffer(offer: any) {
    if (!user || !trackingId) {
      await loadOffers();
      return;
    }
    setStarted(offer.id);
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
    return <AppShell wide><div className="mx-auto max-w-xl rounded-[30px] border border-border bg-surface p-7 text-center shadow-card"><Gift className="mx-auto size-10 text-primary"/><h1 className="mt-4 font-display text-3xl font-semibold">Earn Xora Points</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Sign in to complete eligible offers and keep your points tied to your Xora account.</p><Link to="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</Link></div></AppShell>;
  }

  return <AppShell wide>
    <div className="space-y-5">
      <header className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Offer Wall</p><h1 className="mt-2 font-display text-3xl font-semibold">Earn Xora Points</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Complete eligible CPAGrip offers to earn points. Points are a secondary way to access future Xora data discounts and course unlocks.</p></div>
          <div className="rounded-2xl bg-primary px-4 py-3 text-right text-primary-foreground"><p className="text-xs opacity-80">Xora Points</p><p className="text-2xl font-bold">{points.toLocaleString()} XP</p></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><ShieldCheck className="size-3.5"/> CPAGrip tracked</span><span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><Info className="size-3.5"/> Points credit after confirmation</span></div>
      </header>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Available offers</h2><p className="mt-1 text-sm text-muted-foreground">The list is fetched from CPAGrip for the user's region and device.</p></div><button onClick={() => void loadOffers()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{loading ? <Loader2 className="size-4 animate-spin"/> : <Sparkles className="size-4"/>}{loading ? "Loading…" : "Load offers"}</button></div>
        {error ? <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        {!offers.length && !loading ? <div className="mt-5 rounded-2xl border border-dashed border-border p-7 text-center"><Gift className="mx-auto size-8 text-primary"/><p className="mt-3 text-sm font-semibold">Ready when you are</p><p className="mt-1 text-xs text-muted-foreground">Tap “Load offers” to retrieve the live feed.</p></div> : null}
        <div className="mt-5 grid gap-3">
          {offers.map((offer) => <article key={offer.id} className="overflow-hidden rounded-2xl border border-border bg-background">
            <div className="flex gap-3 p-4">
              {offer.imageUrl ? <img src={offer.imageUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover" loading="lazy"/> : <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Gift className="size-7"/></div>}
              <div className="min-w-0 flex-1"><h3 className="font-semibold">{offer.title}</h3><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{offer.description || "Complete the advertiser's requirements to receive Xora Points."}</p><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">+{Number(offer.points).toLocaleString()} XP</span>{offer.offerType ? <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">{offer.offerType}</span> : null}</div></div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3"><span className="text-[11px] text-muted-foreground">Reward confirmed by CPAGrip</span><button onClick={() => void startOffer(offer)} disabled={started === offer.id || !trackingId} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{started === offer.id ? <Loader2 className="size-3.5 animate-spin"/> : <ArrowRight className="size-3.5"/>}Start offer</button></div>
          </article>)}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[["Data","Use points for eligible data discounts."],["Courses","Use points to unlock eligible courses."],["Creators","Creators can promote eligible offers and earn 35% of the CPAGrip payout on their approved conversions, subject to the 200-conversion payout threshold."]].map(([title,copy]) => <div key={title} className="rounded-2xl border border-border bg-surface p-4"><WalletCards className="size-5 text-primary"/><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy}</p></div>)}
      </section>
    </div>
  </AppShell>;
}
