import { useEffect, useState } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import type { Campaign, CampaignPlacement } from "@/lib/campaigns/types";
import { cn } from "@/lib/utils";

interface LargeBannerPopupAdProps {
  placement?: CampaignPlacement;
  delayMs?: number;
}

export function LargeBannerPopupAd({ placement, delayMs = 600 }: LargeBannerPopupAdProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchCampaign = async () => {
      try {
        // Fetch all active campaigns or target placement
        const query = placement ? `?placement=${encodeURIComponent(placement)}` : "";
        const res = await fetch(`/api/campaigns${query}`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; campaigns: Campaign[] };
          if (data.ok && data.campaigns && data.campaigns.length > 0) {
            // Find active pop-up campaigns (cinema_popup, reward_popup, all, or requested placement)
            const activePool = data.campaigns.filter((c) => {
              if (c.status !== "active") return false;
              if (placement) return c.placement === placement || c.placement === "all";
              return (
                c.placement === "cinema_popup" ||
                c.placement === "reward_popup" ||
                c.placement === "all" ||
                c.placement === "home_feed"
              );
            });

            const poolToUse =
              activePool.length > 0
                ? activePool
                : data.campaigns.filter((c) => c.status === "active");

            if (poolToUse.length > 0 && isMounted) {
              // Select highest priority
              const topCampaign = poolToUse.sort(
                (a, b) => (b.priority ?? 50) - (a.priority ?? 50),
              )[0];

              setCampaign(topCampaign);

              setTimeout(() => {
                if (isMounted) {
                  setIsOpen(true);
                  // Record impression
                  void fetch("/api/campaigns/impression", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: topCampaign.id }),
                  }).catch(() => {});
                }
              }, delayMs);
            }
          }
        }
      } catch {
        // silence
      }
    };

    void fetchCampaign();
    return () => {
      isMounted = false;
    };
  }, [placement, delayMs]);

  if (!isOpen || !campaign) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    if (campaign) {
      sessionStorage.setItem(`xora_ad_dismissed_${campaign.id}`, "1");
    }
  };

  const handleCtaClick = () => {
    if (campaign) {
      void fetch("/api/campaigns/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }),
      }).catch(() => {});

      const rawCta = (campaign.ctaUrl || "").trim();
      if (rawCta) {
        const targetUrl =
          rawCta.startsWith("http://") || rawCta.startsWith("https://")
            ? rawCta
            : rawCta.split(/\s+/)[0];

        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = targetUrl;
        }
      }
    }
    handleDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-card text-card-foreground shadow-2xl ring-1 ring-white/10">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur-md transition-colors hover:bg-black hover:text-white"
          aria-label="Close ad"
        >
          <X className="size-4" />
        </button>

        {/* Banner Image */}
        {campaign.bannerUrl ? (
          <div className="relative h-52 w-full overflow-hidden bg-muted sm:h-64">
            <img
              src={campaign.bannerUrl}
              alt={campaign.headline}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/90 px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-sm">
                <Sparkles className="size-3" /> {campaign.badge || "Sponsored"}
              </span>
              {campaign.sponsorName ? (
                <span className="rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
                  {campaign.sponsorName}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Content Details */}
        <div className="p-6">
          {!campaign.bannerUrl ? (
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
                <Sparkles className="size-3" /> {campaign.badge || "Featured"}
              </span>
              {campaign.sponsorName ? (
                <span className="text-xs font-medium text-muted-foreground">
                  By {campaign.sponsorName}
                </span>
              ) : null}
            </div>
          ) : null}

          <h3 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {campaign.headline}
          </h3>

          {campaign.subheadline ? (
            <p className="mt-1.5 text-sm font-medium text-primary/90">{campaign.subheadline}</p>
          ) : null}

          {campaign.description ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {campaign.description}
            </p>
          ) : null}

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full border border-border bg-background px-5 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleCtaClick}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 hover:bg-primary/90"
            >
              <span>{campaign.ctaText || "Learn More"}</span>
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
