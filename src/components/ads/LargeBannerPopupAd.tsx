import { useEffect, useState, useRef, useCallback } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import type { Campaign, CampaignPlacement } from "@/lib/campaigns/types";
import { cn } from "@/lib/utils";

interface LargeBannerPopupAdProps {
  placement?: CampaignPlacement;
  delayMs?: number;
  triggerKey?: string | number | boolean;
  onClose?: () => void;
}

export function LargeBannerPopupAd({
  placement,
  delayMs = 600,
  triggerKey,
  onClose,
}: LargeBannerPopupAdProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const lastTriggerRef = useRef<string | number | boolean | undefined>(undefined);

  const fetchAndShowAd = useCallback(
    async (isManualTrigger = false) => {
      try {
        const query = placement ? `?placement=${encodeURIComponent(placement)}` : "";
        const res = await fetch(`/api/campaigns${query}`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; campaigns: Campaign[] };
          if (data.ok && data.campaigns && data.campaigns.length > 0) {
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

            if (poolToUse.length > 0) {
              const topCampaign = poolToUse.sort(
                (a, b) => (b.priority ?? 50) - (a.priority ?? 50),
              )[0];

              setCampaign(topCampaign);

              const timer = setTimeout(
                () => {
                  setIsOpen(true);
                  void fetch("/api/campaigns/impression", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: topCampaign.id }),
                  }).catch(() => {});
                },
                isManualTrigger ? 150 : delayMs,
              );

              return () => clearTimeout(timer);
            }
          }
        }
      } catch {
        // silence error
      }
    },
    [placement, delayMs],
  );

  // Initial load
  useEffect(() => {
    let active = true;
    void fetchAndShowAd(false);
    return () => {
      active = false;
    };
  }, [fetchAndShowAd]);

  // Dynamic trigger when triggerKey changes (e.g. landscape mode toggled on)
  useEffect(() => {
    if (triggerKey !== undefined && triggerKey !== lastTriggerRef.current) {
      lastTriggerRef.current = triggerKey;
      if (triggerKey) {
        void fetchAndShowAd(true);
      }
    }
  }, [triggerKey, fetchAndShowAd]);

  if (!isOpen || !campaign) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    if (campaign) {
      sessionStorage.setItem(`xora_ad_dismissed_${campaign.id}`, "1");
    }
    if (onClose) onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-[#0e0b17] text-card-foreground shadow-2xl ring-1 ring-white/10 max-h-[92vh] flex flex-col",
          campaign.bannerUrl
            ? "landscape:max-w-3xl landscape:grid landscape:grid-cols-12 landscape:items-stretch landscape:max-h-[88vh]"
            : "landscape:max-w-xl",
        )}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-30 rounded-full bg-black/75 p-2 text-white/90 backdrop-blur-md transition-colors hover:bg-black hover:text-white ring-1 ring-white/15"
          aria-label="Close ad"
        >
          <X className="size-4" />
        </button>

        {/* Banner Image (Full width in portrait, Left column in landscape) */}
        {campaign.bannerUrl ? (
          <div className="relative h-44 sm:h-56 w-full shrink-0 overflow-hidden bg-muted landscape:col-span-5 landscape:h-full landscape:min-h-[240px]">
            <img
              src={campaign.bannerUrl}
              alt={campaign.headline}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b17] via-[#0e0b17]/20 to-transparent landscape:bg-gradient-to-r landscape:from-transparent landscape:to-[#0e0b17]" />
            <div className="absolute bottom-3 left-3 sm:left-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-primary-foreground shadow-sm">
                <Sparkles className="size-2.5 sm:size-3" /> {campaign.badge || "Sponsored"}
              </span>
              {campaign.sponsorName ? (
                <span className="rounded-full bg-black/70 px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                  {campaign.sponsorName}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Content Details (Vertical stack in portrait, Right column in landscape) */}
        <div
          className={cn(
            "p-5 sm:p-6 flex flex-col justify-between overflow-y-auto",
            campaign.bannerUrl ? "landscape:col-span-7 landscape:p-6" : "w-full",
          )}
        >
          <div>
            {!campaign.bannerUrl ? (
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-3 py-1 text-[11px] font-bold text-primary">
                  <Sparkles className="size-3" /> {campaign.badge || "Featured Promotion"}
                </span>
                {campaign.sponsorName ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    By {campaign.sponsorName}
                  </span>
                ) : null}
              </div>
            ) : null}

            <h3 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white leading-snug">
              {campaign.headline}
            </h3>

            {campaign.subheadline ? (
              <p className="mt-1.5 text-xs sm:text-sm font-medium text-primary">
                {campaign.subheadline}
              </p>
            ) : null}

            {campaign.description ? (
              <p className="mt-2 text-xs leading-relaxed text-white/70 sm:text-sm line-clamp-3 sm:line-clamp-4">
                {campaign.description}
              </p>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="mt-5 sm:mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleCtaClick}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 sm:px-6 py-2 sm:py-2.5 text-xs font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 hover:bg-primary/90"
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
