import handler from "@tanstack/react-start/server-entry";
import { handleAdminRoute } from "./server/admin-auth";
import { handleCampaignsRoute } from "./server/campaigns-controller";
import { handleCommerceRoute } from "./server/commerce-controller";
import { handleCpxRewardsRoute } from "./server/cpx-rewards-controller";
import { handleSurveyWalletRoute } from "./server/survey-wallet-controller";
import { handleTvCatalogueRoute } from "./server/tv-catalog-controller";
import { handleXtvSeriesRoute } from "./server/xtv-series-d1-controller";

type Env = Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

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
