import handler from "@tanstack/react-start/server-entry";
import { handleAdminRoute } from "./server/admin-auth";
import { handleCampaignsRoute } from "./server/campaigns-controller";
import { handleCommerceRoute } from "./server/commerce-controller";
import { handleCpxRewardsRoute } from "./server/cpx-rewards-controller";
import { handleSurveyWalletRoute } from "./server/survey-wallet-controller";
import { handleTvCatalogueRoute } from "./server/tv-catalog-controller";
import { handleXtvSeriesRoute } from "./server/xtv-series-d1-controller";
import { executeYouTubeApiSearch } from "./integrations/providers/youtube";

type Env = Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // The legacy Node entrypoint exposed this provider proxy inline. The
    // Cloudflare entrypoint must expose it too, otherwise global search gets 404.
    if (path === "/api/youtube/search" && request.method === "GET") {
      const apiKey = String(env.YOUTUBE_API_KEY || env.VITE_YOUTUBE_API_KEY || "");
      if (!apiKey.trim()) {
        return new Response(JSON.stringify({
          ok: false, count: 0, candidates: [],
          error: "YouTube API key is not configured in the Cloudflare Worker.",
        }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }

      const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      const feed = url.searchParams.get("feed") as "home" | "shorts" | "learn" | undefined;
      const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
      const order = (url.searchParams.get("order") || "relevance") as "date" | "relevance";
      if (!query.trim() && feed !== "home" && feed !== "shorts") {
        return new Response(JSON.stringify({ ok: true, count: 0, candidates: [] }), {
          status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }

      try {
        const result = await executeYouTubeApiSearch(
          { query, limit, feed, order },
          { apiKey, referer: request.headers.get("referer") || request.headers.get("origin") || undefined },
        );
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 502,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false, count: 0, candidates: [],
          error: error instanceof Error ? error.message : "YouTube search failed.",
        }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
    }

    const xSeriesResponse = await handleXtvSeriesRoute(request, url, env);
    if (xSeriesResponse) return xSeriesResponse;

    const tvResponse = await handleTvCatalogueRoute(request, url);
    if (tvResponse) return tvResponse;

    // Essential application APIs. Firebase RTDB and Supabase remain the data stores;
    // these existing controllers preserve their current API contracts and checks.
    if (path.startsWith("/api/commerce") || path.startsWith("/s/") ||
        path === "/api/webhooks/mele" || path === "/api/webhooks/vas" ||
        path === "/api/webhooks/discount-cpa") {
      const response = await handleCommerceRoute(request, url);
      if (response) return response;
    }

    if (path.startsWith("/api/survey-wallet") || path.startsWith("/api/admin/survey-wallet")) {
      const response = await handleSurveyWalletRoute(request, url);
      if (response) return response;
    }

    if (path.startsWith("/api/cpx/rewards")) {
      const response = await handleCpxRewardsRoute(request, url);
      if (response) return response;
    }

    if (path.startsWith("/api/campaigns") || path.startsWith("/api/admin/campaigns")) {
      const response = await handleCampaignsRoute(request, url);
      if (response) return response;
    }

    if (path.startsWith("/api/admin")) {
      const response = await handleAdminRoute(request, url);
      if (response) return response;
    }

    // TanStack Start handles the frontend, custom authentication (/api/auth),
    // subscriptions, profiles, feed, chat and other file-based API routes.
    // Node server startup jobs, Python crawlers, HLS relay/proxy, and local
    // filesystem media routes are intentionally not imported into this Worker.
    return handler.fetch(request, env);
  },
};
