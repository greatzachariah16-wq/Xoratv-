import { verifyAdminSession } from "./admin-auth";
import {
  getAllCampaigns,
  getActiveCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  recordImpression,
  recordClick,
  computeCampaignAnalytics,
} from "./campaigns-service";
import type { Campaign, CampaignPlacement, CampaignStatus } from "../lib/campaigns/types";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};

const jsonReply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });

export async function handleCampaignsRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  // Handle CORS preflight
  if (
    request.method === "OPTIONS" &&
    (pathname.startsWith("/api/campaigns") || pathname.startsWith("/api/admin/campaigns"))
  ) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ==============================================================
  // 1. PUBLIC CLIENT ENDPOINTS
  // ==============================================================

  // GET /api/campaigns (filtered by ?placement=...)
  if (pathname === "/api/campaigns" && request.method === "GET") {
    try {
      const placement = url.searchParams.get("placement") || undefined;
      const campaigns = await getActiveCampaigns(placement);
      return jsonReply({
        ok: true,
        campaigns,
        count: campaigns.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching campaigns";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/campaigns/impression
  if (pathname === "/api/campaigns/impression" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      if (!body.id) {
        return jsonReply({ ok: false, error: "Campaign ID is required" }, 400);
      }
      await recordImpression(body.id);
      return jsonReply({ ok: true });
    } catch (err: unknown) {
      return jsonReply({ ok: false, error: String(err) }, 500);
    }
  }

  // POST /api/campaigns/click
  if (pathname === "/api/campaigns/click" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      if (!body.id) {
        return jsonReply({ ok: false, error: "Campaign ID is required" }, 400);
      }
      await recordClick(body.id);
      return jsonReply({ ok: true });
    } catch (err: unknown) {
      return jsonReply({ ok: false, error: String(err) }, 500);
    }
  }

  // ==============================================================
  // 2. ADMIN AUTHENTICATED ENDPOINTS
  // ==============================================================

  if (pathname.startsWith("/api/admin/campaigns")) {
    const adminCheck = verifyAdminSession(request);
    if (!adminCheck.authorized) {
      return jsonReply(
        {
          ok: false,
          error: "Unauthorized. Sovereign Admin session required.",
          code: "ADMIN_AUTH_REQUIRED",
        },
        401,
      );
    }

    // GET /api/admin/campaigns (all campaigns + metrics)
    if (pathname === "/api/admin/campaigns" && request.method === "GET") {
      try {
        const campaigns = await getAllCampaigns();
        const analytics = computeCampaignAnalytics(campaigns);
        return jsonReply({
          ok: true,
          campaigns,
          analytics,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching admin campaigns";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/campaigns/create
    if (pathname === "/api/admin/campaigns/create" && request.method === "POST") {
      try {
        const payload = (await request.json()) as Partial<Campaign>;
        if (!payload.headline || !payload.bannerUrl || !payload.ctaText || !payload.ctaUrl) {
          return jsonReply(
            { ok: false, error: "Headline, Banner URL, CTA Text, and CTA URL are required." },
            400,
          );
        }

        const created = await createCampaign(payload);
        return jsonReply({
          ok: true,
          campaign: created,
          message: "Campaign created successfully.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error creating campaign";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/campaigns/update
    if (pathname === "/api/admin/campaigns/update" && request.method === "POST") {
      try {
        const payload = (await request.json()) as Partial<Campaign> & { id: string };
        if (!payload.id) {
          return jsonReply({ ok: false, error: "Campaign ID is required for update." }, 400);
        }

        const updated = await updateCampaign(payload.id, payload);
        if (!updated) {
          return jsonReply({ ok: false, error: "Campaign not found." }, 404);
        }

        return jsonReply({
          ok: true,
          campaign: updated,
          message: "Campaign updated successfully.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error updating campaign";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/campaigns/toggle-status
    if (pathname === "/api/admin/campaigns/toggle-status" && request.method === "POST") {
      try {
        const { id, status } = (await request.json()) as { id: string; status: CampaignStatus };
        if (!id || !status) {
          return jsonReply(
            { ok: false, error: "Campaign ID and target status are required." },
            400,
          );
        }

        const updated = await updateCampaign(id, { status });
        if (!updated) {
          return jsonReply({ ok: false, error: "Campaign not found." }, 404);
        }

        return jsonReply({
          ok: true,
          campaign: updated,
          message: `Campaign status changed to ${status}.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error toggling campaign status";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/campaigns/delete
    if (pathname === "/api/admin/campaigns/delete" && request.method === "POST") {
      try {
        const { id } = (await request.json()) as { id: string };
        if (!id) {
          return jsonReply({ ok: false, error: "Campaign ID is required for deletion." }, 400);
        }

        const success = await deleteCampaign(id);
        return jsonReply({
          ok: success,
          message: success ? "Campaign deleted successfully." : "Failed to delete campaign.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error deleting campaign";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }
  }

  return null;
}
