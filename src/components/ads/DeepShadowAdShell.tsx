import { useEffect, useRef } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/lib/campaigns/types";
import { cn } from "@/lib/utils";

interface DeepShadowAdShellProps {
  campaign: Campaign;
  className?: string;
  variant?: "card" | "banner" | "compact";
  onImpression?: (campaignId: string) => void;
  onClick?: (campaignId: string) => void;
}

/**
 * Deep-Shadow Ad Shell Component
 *
 * Implements the signature Xora purple/near-black aesthetic:
 * - Layered deep shadow structure
 * - Dark purple/near-black background foundation (#0d0b14 to #181226)
 * - Restrained violet/purple highlight borders (border-primary/20)
 * - Clear distinction as sponsored content while maintaining cinematic polish
 */
export function DeepShadowAdShell({
  campaign,
  className,
  variant = "card",
  onImpression,
  onClick,
}: DeepShadowAdShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const impressionRecorded = useRef(false);

  // Track impression once visible in viewport
  useEffect(() => {
    if (!containerRef.current || impressionRecorded.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !impressionRecorded.current) {
          impressionRecorded.current = true;
          if (onImpression) {
            onImpression(campaign.id);
          } else {
            void fetch("/api/campaigns/impression", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: campaign.id }),
            }).catch(() => {});
          }
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [campaign.id, onImpression]);

  const handleCtaClick = () => {
    if (onClick) {
      onClick(campaign.id);
    } else {
      void fetch("/api/campaigns/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }),
      }).catch(() => {});
    }

    if (campaign.ctaUrl) {
      if (campaign.ctaUrl.startsWith("http://") || campaign.ctaUrl.startsWith("https://")) {
        window.open(campaign.ctaUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = campaign.ctaUrl;
      }
    }
  };

  if (variant === "compact") {
    return (
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-primary/25 bg-[#0f0c18] p-3.5 shadow-lift transition duration-200 hover:border-primary/45",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {campaign.bannerUrl && (
              <img
                src={campaign.bannerUrl}
                alt={campaign.headline}
                className="size-10 shrink-0 rounded-lg object-cover border border-white/10"
                loading="lazy"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                  {campaign.badge || "Sponsored"}
                </span>
                {campaign.sponsorName && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {campaign.sponsorName}
                  </span>
                )}
              </div>
              <h4 className="truncate text-xs font-semibold text-foreground mt-0.5">
                {campaign.headline}
              </h4>
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleCtaClick}
            className="h-8 shrink-0 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground shadow-card hover:bg-primary/90"
          >
            {campaign.ctaText || "View"}
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-[#120e20] via-[#1a142c] to-[#0e0a1b] p-5 shadow-lift sm:p-6",
          className,
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="size-3" />
                {campaign.badge || "Sponsored Promotion"}
              </span>
              {campaign.sponsorName && (
                <span className="text-[11px] text-muted-foreground">by {campaign.sponsorName}</span>
              )}
            </div>
            <h3 className="font-display text-base font-bold text-foreground sm:text-lg">
              {campaign.headline}
            </h3>
            {campaign.subheadline && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {campaign.subheadline}
              </p>
            )}
          </div>

          <Button
            onClick={handleCtaClick}
            className="h-10 shrink-0 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-lift hover:bg-primary/90"
          >
            {campaign.ctaText || "Learn More"}
            <ExternalLink className="ml-1.5 size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Default "card" presentation (e.g. inside Reward Popup or beneath content player)
  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-primary/20 bg-[#110d1f] shadow-lift transition duration-200 hover:border-primary/40",
        className,
      )}
    >
      {/* Top Banner Media if available */}
      {campaign.bannerUrl && (
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-black/40 sm:aspect-[2.4/1]">
          <img
            src={campaign.bannerUrl}
            alt={campaign.headline}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#110d1f] via-transparent to-black/30" />
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
              <Sparkles className="size-2.5 text-primary" />
              {campaign.badge || "Sponsored"}
            </span>
          </div>
          {campaign.sponsorName && (
            <div className="absolute right-3 top-3">
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-md">
                {campaign.sponsorName}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="p-4 sm:p-5">
        {!campaign.bannerUrl && (
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="size-2.5" />
              {campaign.badge || "Sponsored"}
            </span>
            {campaign.sponsorName && (
              <span className="text-[11px] text-muted-foreground">{campaign.sponsorName}</span>
            )}
          </div>
        )}

        <h3 className="font-display text-base font-bold text-foreground sm:text-lg leading-snug">
          {campaign.headline}
        </h3>

        {campaign.subheadline && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {campaign.subheadline}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/40 pt-3">
          <span className="text-[10px] font-medium text-muted-foreground/70">
            Promotional Partner
          </span>
          <Button
            size="sm"
            onClick={handleCtaClick}
            className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-card hover:bg-primary/90"
          >
            {campaign.ctaText || "Claim Offer"}
            <ExternalLink className="ml-1.5 size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
