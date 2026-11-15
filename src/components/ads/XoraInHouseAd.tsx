import { useEffect, useState } from "react";
import type { Campaign, CampaignPlacement } from "@/lib/campaigns/types";
import { DeepShadowAdShell } from "./DeepShadowAdShell";

const PREVIEW_NO_ADS = import.meta.env.VITE_PREVIEW_NO_ADS === "true";

interface XoraInHouseAdProps {
  placement?: CampaignPlacement;
  variant?: "card" | "banner" | "compact";
  className?: string;
  campaign?: Campaign; // Optional override if provided directly
  collapseWhenEmpty?: boolean;
  onAvailabilityChange?: (available: boolean) => void;
}

export function XoraInHouseAd({
  placement = "all",
  variant = "card",
  className,
  campaign: initialCampaign,
  collapseWhenEmpty = false,
  onAvailabilityChange,
}: XoraInHouseAdProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(initialCampaign || null);
  const [loading, setLoading] = useState(!initialCampaign);

  useEffect(() => {
    if (PREVIEW_NO_ADS) {
      setLoading(false);
      onAvailabilityChange?.(false);
      return;
    }
    if (initialCampaign) {
      setCampaign(initialCampaign);
      setLoading(false);
      onAvailabilityChange?.(true);
      return;
    }

    let isMounted = true;
    const fetchCampaign = async () => {
      let foundCampaign = false;
      try {
        const query = placement ? `?placement=${encodeURIComponent(placement)}` : "";
        const res = await fetch(`/api/campaigns${query}`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; campaigns: Campaign[] };
          if (data.ok && data.campaigns && data.campaigns.length > 0) {
            if (isMounted) {
              // Prefer exact placement match first if available
              const exactMatches = data.campaigns.filter((c) => c.placement === placement);
              const pool = exactMatches.length > 0 ? exactMatches : data.campaigns;

              // Pick top priority campaign or random among highest priority group
              const maxPriority = Math.max(...pool.map((c) => c.priority ?? 50));
              const topTier = pool.filter((c) => (c.priority ?? 50) >= maxPriority - 10);
              const selected = topTier[Math.floor(Math.random() * topTier.length)];

              const chosen = selected || pool[0];
              setCampaign(chosen);
              foundCampaign = Boolean(chosen);
              onAvailabilityChange?.(Boolean(chosen));
            }
          }
        }
      } catch {
        // graceful silence
      } finally {
        if (isMounted) {
          setLoading(false);
          if (!foundCampaign) onAvailabilityChange?.(false);
        }
      }
    };

    void fetchCampaign();
    return () => {
      isMounted = false;
    };
  }, [placement, initialCampaign, onAvailabilityChange]);

  if (loading) {
    return collapseWhenEmpty ? null : <div className="h-28 w-full animate-pulse rounded-2xl bg-secondary/30" />;
  }

  if (!campaign || PREVIEW_NO_ADS) {
    return null;
  }

  return <DeepShadowAdShell campaign={campaign} variant={variant} className={className} />;
}
