import handler from "@tanstack/react-start/server-entry";

const EDGE_API_ORIGIN = "https://xoratv-edge-api.ericgreat668.workers.dev";
const EDGE_API_PATHS = new Set(["/api/tv/channels", "/api/tv/guide", "/api/tv/playback-feedback"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // These endpoints have already been ported to the dedicated Worker.
    // Forward the original query and browser Origin so its CORS allowlist remains active.
    if (EDGE_API_PATHS.has(url.pathname) && (request.method === "GET" || request.method === "POST" || request.method === "OPTIONS")) {
      const upstream = new URL(url.pathname + url.search, EDGE_API_ORIGIN);
      const headers = new Headers(request.headers);
      const init: RequestInit = { method: request.method, headers, redirect: "manual" };
      if (request.method === "POST") init.body = await request.arrayBuffer();
      return fetch(new Request(upstream, init));
    }

    // All other file-based TanStack routes continue through the official Start SSR handler.
    // The old Node dispatcher is intentionally not imported: its filesystem, child_process,
    // streams and startup timers are not valid in the Workers runtime.
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
