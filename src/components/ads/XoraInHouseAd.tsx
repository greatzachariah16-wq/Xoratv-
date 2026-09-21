import { useEffect, useState } from "react";
import type { Campaign, CampaignPlacement } from "@/lib/campaigns/types";
import { DeepShadowAdShell } from "./DeepShadowAdShell";

interface XoraInHouseAdProps {
  placement?: CampaignPlacement;
  variant?: "card" | "banner" | "compact";
  className?: string;
  campaign?: Campaign; // Optional override if provided directly
}

export function XoraInHouseAd({
  placement = "all",
  variant = "card",
  className,
  campaign: initialCampaign,
}: XoraInHouseAdProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(initialCampaign || null);
  const [loading, setLoading] = useState(!initialCampaign);

  useEffect(() => {
    if (initialCampaign) {
      setCampaign(initialCampaign);
      return;
    }

    let isMounted = true;
    const fetchCampaign = async () => {
      try {
        const query = placement ? `?placement=${encodeURIComponent(placement)}` : "";
        const res = await fetch(`/api/campaigns${query}`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; campaigns: Campaign[] };
          if (data.ok && data.campaigns && data.campaigns.length > 0) {
            // Select highest priority campaign or random top campaign
            if (isMounted) {
              setCampaign(data.campaigns[0]);
            }
          }
        }
      } catch {
        // graceful silence
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchCampaign();
    return () => {
      isMounted = false;
    };
  }, [placement, initialCampaign]);

  if (loading) {
    return <div className="h-28 w-full animate-pulse rounded-2xl bg-secondary/30" />;
  }

  if (!campaign) {
    return null;
  }

  return <DeepShadowAdShell campaign={campaign} variant={variant} className={className} />;
}
