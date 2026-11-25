export interface Env {
  /**
   * Comma-separated exact origins allowed to call this Worker from a browser.
   * Example: https://xoratv-x.onrender.com,https://your-approved-xoratv-domain
   */
  ALLOWED_ORIGINS?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const allowedOrigins = (env.ALLOWED_ORIGINS || "https://xoratv-x.onrender.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type, Authorization");
    headers.set("access-control-max-age", "600");
  }

  return headers;
}

function jsonResponse(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
  status = 200,
): Response {
  const headers = new Headers(JSON_HEADERS);
  const cors = corsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * XoraTV Cloudflare backend migration — staging entrypoint.
 *
 * This Worker intentionally starts with a non-mutating health endpoint only.
 * Production API routes will be ported individually after their dependencies,
 * authentication and data-write behavior have been audited.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const cors = corsHeaders(request, env);
      if (!cors.has("access-control-allow-origin")) {
        return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if ((url.pathname === "/health" || url.pathname === "/api/health") &&
        (request.method === "GET" || request.method === "HEAD")) {
      return jsonResponse(request, env, {
        ok: true,
        service: "xoratv-cloudflare-backend",
        environment: "staging",
        status: "healthy",
      });
    }

    return jsonResponse(
      request,
      env,
      { ok: false, error: "Route not migrated to Cloudflare yet." },
      404,
    );
  },
};
