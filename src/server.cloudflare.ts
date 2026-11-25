import handler from "@tanstack/react-start/server-entry";
import { handleAdminRoute } from "./server/admin-auth";
import { handleCampaignsRoute } from "./server/campaigns-controller";
import { handleCommerceRoute } from "./server/commerce-controller";
import { handleCpxRewardsRoute } from "./server/cpx-rewards-controller";
import { handleSurveyWalletRoute } from "./server/survey-wallet-controller";

const EDGE_API_ORIGIN = "https://xoratv-edge-api.ericgreat668.workers.dev";
const EDGE_API_PATHS = new Set([
  "/api/tv/channels",
  "/api/tv/guide",
  "/api/tv/playback-feedback",
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // The separate edge Worker owns the direct IPTV catalogue and EPG only.
    // It does not proxy or relay any video stream.
    if (EDGE_API_PATHS.has(path) && ["GET", "POST", "OPTIONS"].includes(request.method)) {
      const upstream = new URL(path + url.search, EDGE_API_ORIGIN);
      const headers = new Headers(request.headers);
      const init: RequestInit = { method: request.method, headers, redirect: "manual" };
      if (request.method === "POST") init.body = await request.arrayBuffer();
      return fetch(new Request(upstream, init));
    }

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
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
