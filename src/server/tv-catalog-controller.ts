import { getTvChannels, getTvGuide } from "../integrations/provider-gateway";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleTvCatalogueRoute(
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (url.pathname === "/api/tv/channels") {
    const category = (url.searchParams.get("category") || "").toLowerCase();
    const platform = url.searchParams.get("platform") === "native" ? "native" : "web";
    const query = url.searchParams.get("q") || undefined;
    const country = url.searchParams.get("country") || undefined;
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "30") || 30));
    try {
      const result = await getTvChannels({ category, platform, query, country, limit });
      return json(result, result.ok ? 200 : 502);
    } catch (error) {
      const message = error instanceof Error ? error.message : "TV catalogue unavailable";
      return json({ ok: false, total: 0, channels: [], error: message }, 502);
    }
  }

  if (url.pathname === "/api/tv/guide") {
    const channelId = url.searchParams.get("channel");
    const hours = Math.max(1, Math.min(48, Number(url.searchParams.get("hours") || "12") || 12));
    if (!channelId) return json({ ok: false, programmes: [], error: "Channel is required." }, 400);
    const result = await getTvGuide(channelId, hours);
    return json({ ok: true, channelId, ...result });
  }

  return null;
}
