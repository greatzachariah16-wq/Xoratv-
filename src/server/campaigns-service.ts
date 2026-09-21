import crypto from "node:crypto";
import { queryRtdb, getLocalStore } from "./xseries-service-account";
import type { Campaign, CampaignPlacement, CampaignAnalytics } from "../lib/campaigns/types";

const CAMPAIGNS_RTDB_PATH = "campaigns";

const DEFAULT_INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-default-01",
    headline: "Stream 4K Horror Originals on XoraTV",
    subheadline: "Unlimited indie shockers, psychological thrillers, and exclusive shorts.",
    description: "Experience genuine African and global horror cinema without subscription fees.",
    bannerUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    ctaText: "Explore X Series",
    ctaUrl: "/xtv-series",
    placement: "all",
    status: "active",
    priority: 95,
    sponsorName: "Xora Studios",
    badge: "Featured Premiere",
    impressions: 142,
    clicks: 18,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "camp-default-02",
    headline: "MTN Pulse Night Data Bundle Offer",
    subheadline: "Stream up to 5GB of late-night cinema at blazing 5G speed.",
    description: "Get subsidized streaming bundles directly delivered to your registered MTN line.",
    bannerUrl:
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80",
    ctaText: "Claim Free 1GB",
    ctaUrl: "/rewards",
    placement: "reward_popup",
    status: "active",
    priority: 90,
    sponsorName: "MTN Nigeria Partner",
    badge: "Sponsored Reward",
    impressions: 89,
    clicks: 14,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "camp-default-03",
    headline: "Xora Indie Filmmakers Grant 2026",
    subheadline: "Submit your horror, thriller, or documentary short for global distribution.",
    description: "Funded micro-grants for emerging creators across Nigeria and the diaspora.",
    bannerUrl:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&auto=format&fit=crop&q=80",
    ctaText: "Submit Project",
    ctaUrl: "/create",
    placement: "cinema_under_player",
    status: "active",
    priority: 85,
    sponsorName: "Xora Foundation",
    badge: "Creator Spotlight",
    impressions: 64,
    clicks: 9,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Ensures initial default campaigns exist if none are stored in RTDB or local memory.
 */
async function ensureInitialCampaigns(): Promise<void> {
  const existing = await queryRtdb(CAMPAIGNS_RTDB_PATH).catch(() => null);
  if (!existing || typeof existing !== "object" || Object.keys(existing).length === 0) {
    const initialMap: Record<string, Campaign> = {};
    for (const c of DEFAULT_INITIAL_CAMPAIGNS) {
      initialMap[c.id] = c;
    }
    await queryRtdb(CAMPAIGNS_RTDB_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialMap),
    }).catch((err) => {
      console.warn("[Campaigns Service] Failed to seed initial campaigns in RTDB:", err);
    });

    // Also populate in-memory fallback
    const store = getLocalStore();
    for (const c of DEFAULT_INITIAL_CAMPAIGNS) {
      store.set(`${CAMPAIGNS_RTDB_PATH}/${c.id}`, c);
    }
  }
}

/**
 * Fetch all campaigns from database.
 */
export async function getAllCampaigns(): Promise<Campaign[]> {
  await ensureInitialCampaigns();
  const raw = (await queryRtdb(CAMPAIGNS_RTDB_PATH).catch(() => null)) as Record<
    string,
    Campaign
  > | null;

  if (raw && typeof raw === "object") {
    return Object.values(raw)
      .filter((c): c is Campaign => Boolean(c && typeof c === "object" && c.id))
      .sort(
        (a, b) =>
          (b.priority ?? 50) - (a.priority ?? 50) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  // Check in-memory store
  const store = getLocalStore();
  const list: Campaign[] = [];
  const prefix = `${CAMPAIGNS_RTDB_PATH}/`;
  for (const [k, v] of store.entries()) {
    if (k.startsWith(prefix) && v && typeof v === "object" && "id" in v) {
      list.push(v as Campaign);
    }
  }

  return list.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
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
      if (start > now) return false;
    }
    if (c.endDate) {
      const end = new Date(c.endDate).getTime();
      if (end < now) return false;
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
  return item && typeof item === "object" && "id" in item ? (item as Campaign) : null;
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
