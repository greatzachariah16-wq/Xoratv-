import { verifyAdminSession } from "./admin-auth";
import { getPrerollConfig, updatePrerollConfig, type PrerollConfig } from "./preroll-service";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};

const jsonReply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });

export async function handlePrerollRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  if (
    request.method === "OPTIONS" &&
    (pathname.startsWith("/api/preroll") || pathname.startsWith("/api/admin/preroll"))
  ) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET /api/preroll/config
  if (pathname === "/api/preroll/config" && request.method === "GET") {
    try {
      const config = await getPrerollConfig();
      return jsonReply({ ok: true, config });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching preroll config";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/admin/preroll/config
  if (pathname === "/api/admin/preroll/config" && request.method === "POST") {
    const adminCheck = verifyAdminSession(request);
    if (!adminCheck.authorized) {
      return jsonReply({ ok: false, error: adminCheck.error, code: "ADMIN_AUTH_REQUIRED" }, 401);
    }

    try {
      const body = (await request.json().catch(() => ({}))) as Partial<PrerollConfig>;
      const config = await updatePrerollConfig(body);
      return jsonReply({ ok: true, config, message: "Pre-roll configuration saved successfully" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating preroll config";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  return null;
}
