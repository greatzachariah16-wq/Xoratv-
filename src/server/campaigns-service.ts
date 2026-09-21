import crypto from "node:crypto";
import { queryRtdb, getLocalStore } from "./xseries-service-account";
import type { Campaign, CampaignPlacement, CampaignAnalytics } from "../lib/campaigns/types";

const CAMPAIGNS_RTDB_PATH = "campaigns";

/**
 * Fetch all campaigns from database.
 */
export async function getAllCampaigns(): Promise<Campaign[]> {
  const raw = (await queryRtdb(CAMPAIGNS_RTDB_PATH).catch(() => null)) as Record<
    string,
    Campaign
  > | null;

  const campaignMap = new Map<string, Campaign>();

  if (raw && typeof raw === "object") {
    for (const [id, c] of Object.entries(raw)) {
      if (c && typeof c === "object" && c.id) {
        campaignMap.set(c.id, c);
      }
    }
  } else {
    // Check in-memory store
    const store = getLocalStore();
    const prefix = `${CAMPAIGNS_RTDB_PATH}/`;
    for (const [k, v] of store.entries()) {
      if (k.startsWith(prefix) && v && typeof v === "object" && "id" in v) {
        const c = v as Campaign;
        campaignMap.set(c.id, c);
      }
    }
  }

  return Array.from(campaignMap.values()).sort(
    (a, b) =>
      (b.priority ?? 50) - (a.priority ?? 50) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Fetch active campaigns filtered by placement for live display.
 */
export async function getActiveCampaigns(placement?: string): Promise<Campaign[]> {
  const all = await getAllCampaigns();
  const now = Date.now();

  return all.filter((c) => {
    if (c.status !== "active") return false;

    // Check date boundaries if set
    if (c.startDate) {
      const start = new Date(c.startDate).getTime();
      if (!isNaN(start) && start > now) return false;
    }
    if (c.endDate) {
      let end = new Date(c.endDate).getTime();
      if (!isNaN(end)) {
        // If endDate is YYYY-MM-DD without time, extend to end-of-day 23:59:59.999
        if (!c.endDate.includes("T")) {
          end += 86399999;
        }
        if (end < now) return false;
      }
    }

    // Filter by placement
    if (placement && placement !== "all") {
      if (c.placement !== "all" && c.placement !== placement) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get a single campaign by ID.
 */
export async function getCampaignById(id: string): Promise<Campaign | null> {
  if (!id) return null;
  const raw = await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}`).catch(() => null);
  if (raw && typeof raw === "object" && "id" in raw) {
    return raw as Campaign;
  }
  const store = getLocalStore();
  const item = store.get(`${CAMPAIGNS_RTDB_PATH}/${id}`);
  if (item && typeof item === "object" && "id" in item) {
    return item as Campaign;
  }

  return null;
}

/**
 * Create a new campaign.
 */
export async function createCampaign(data: Partial<Campaign>): Promise<Campaign> {
  const id = `camp-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const newCampaign: Campaign = {
    id,
    headline: (data.headline || "").trim() || "Promotional Feature",
    subheadline: data.subheadline?.trim() || "",
    description: data.description?.trim() || "",
    bannerUrl: (data.bannerUrl || "").trim(),
    ctaText: (data.ctaText || "Learn More").trim(),
    ctaUrl: (data.ctaUrl || "/").trim(),
    placement: (data.placement as CampaignPlacement) || "all",
    status: (data.status as CampaignStatus) || "active",
    priority: typeof data.priority === "number" ? Math.max(1, Math.min(100, data.priority)) : 50,
    sponsorName: data.sponsorName?.trim() || "Xora Partner",
    badge: data.badge?.trim() || "Sponsored",
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };

  await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newCampaign),
  });

  const store = getLocalStore();
  store.set(`${CAMPAIGNS_RTDB_PATH}/${id}`, newCampaign);

  return newCampaign;
}

/**
 * Update an existing campaign.
 */
export async function updateCampaign(
  id: string,
  updates: Partial<Campaign>,
): Promise<Campaign | null> {
  const existing = await getCampaignById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Campaign = {
    ...existing,
    ...updates,
    id: existing.id, // Immutable ID
    updatedAt: now,
  };

  await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });

  const store = getLocalStore();
  store.set(`${CAMPAIGNS_RTDB_PATH}/${id}`, updated);

  return updated;
}

/**
 * Delete a campaign permanently.
 */
export async function deleteCampaign(id: string): Promise<boolean> {
  if (!id) return false;
  await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}`, {
    method: "DELETE",
  });
  const store = getLocalStore();
  store.delete(`${CAMPAIGNS_RTDB_PATH}/${id}`);
  return true;
}

/**
 * Record an impression for a campaign.
 */
export async function recordImpression(id: string): Promise<void> {
  if (!id) return;
  const campaign = await getCampaignById(id);
  if (!campaign) return;

  const updatedImpressions = (campaign.impressions || 0) + 1;
  const updated = {
    ...campaign,
    impressions: updatedImpressions,
    updatedAt: new Date().toISOString(),
  };

  await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}/impressions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedImpressions),
  }).catch(() => {});

  const store = getLocalStore();
  store.set(`${CAMPAIGNS_RTDB_PATH}/${id}`, updated);
}

/**
 * Record a click for a campaign.
 */
export async function recordClick(id: string): Promise<void> {
  if (!id) return;
  const campaign = await getCampaignById(id);
  if (!campaign) return;

  const updatedClicks = (campaign.clicks || 0) + 1;
  const updated = {
    ...campaign,
    clicks: updatedClicks,
    updatedAt: new Date().toISOString(),
  };

  await queryRtdb(`${CAMPAIGNS_RTDB_PATH}/${id}/clicks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedClicks),
  }).catch(() => {});

  const store = getLocalStore();
  store.set(`${CAMPAIGNS_RTDB_PATH}/${id}`, updated);
}

/**
 * Compute aggregate performance metrics across all campaigns.
 */
export function computeCampaignAnalytics(campaigns: Campaign[]): CampaignAnalytics {
  let activeCampaigns = 0;
  let pausedCampaigns = 0;
  let archivedCampaigns = 0;
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const c of campaigns) {
    if (c.status === "active") activeCampaigns++;
    else if (c.status === "paused") pausedCampaigns++;
    else if (c.status === "archived") archivedCampaigns++;

    totalImpressions += c.impressions || 0;
    totalClicks += c.clicks || 0;
  }

  const averageCtr =
    totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns,
    pausedCampaigns,
    archivedCampaigns,
    totalImpressions,
    totalClicks,
    averageCtr,
  };
}
