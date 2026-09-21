export type CampaignPlacement =
  "all" | "reward_popup" | "cinema_under_player" | "home_feed" | "xseries_feed" | "chat_banner";

export type CampaignStatus = "active" | "paused" | "archived";

export interface Campaign {
  id: string;
  headline: string;
  subheadline?: string;
  description?: string;
  bannerUrl: string;
  ctaText: string;
  ctaUrl: string;
  placement: CampaignPlacement;
  status: CampaignStatus;
  priority: number; // 1 - 100, higher priority renders first
  sponsorName?: string;
  badge?: string; // e.g. "Sponsored", "Featured Deal", "Exclusive"
  startDate?: string | null;
  endDate?: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignAnalytics {
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  archivedCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  averageCtr: number; // percentage
}

export interface AdminCampaignsResponse {
  ok: boolean;
  campaigns: Campaign[];
  analytics: CampaignAnalytics;
}
