import {
  fetchIptvChannels,
} from "../integrations/providers/iptv-org";
import { getIptvOrgGuide } from "../integrations/providers/iptv-org-epg";
import {
  fetchNexusChannels,
  getNexusGuide,
} from "../integrations/providers/iptv-nexus";

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
    const nativePlatform = url.searchParams.get("platform") === "native";
    const query = url.searchParams.get("q") || undefined;
    const country = url.searchParams.get("country") || undefined;
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "30") || 30));

    try {
      if (category === "movies" || category === "series") {
        const result = await fetchIptvChannels({
          query,
          country,
          category,
          limit,
          platform: nativePlatform ? "native" : "web",
        });
        const channels = result.channels.map((channel) => ({
          ...channel,
          provider: "iptv-org" as const,
        }));
        return json({
          ok: result.ok,
          total: result.total,
          channels,
          ...(result.error ? { error: result.error } : {}),
        }, result.ok ? 200 : 502);
      }

      const result = await fetchNexusChannels({
        query,
        country,
        category: url.searchParams.get("category") || undefined,
        limit,
        platform: nativePlatform ? "native" : "web",
      });
      const fallbackBrands = category === "sports"
        ? ["ESPN", "SuperSport"]
        : query && /espn/i.test(query)
          ? ["ESPN"]
          : query && /supersport/i.test(query)
            ? ["SuperSport"]
            : [];
      const fallbacks = await Promise.all(fallbackBrands.map((brand) =>
        fetchIptvChannels({ query: brand, limit: 100, platform: nativePlatform ? "native" : "web" })
          .catch(() => ({ channels: [], total: 0, ok: false })),
      ));
      const merged = new Map<string, (typeof result.channels)[number] & { provider?: "iptv-org" }>();
      for (const channel of result.channels) merged.set(channel.id, channel);
      for (const channel of fallbacks.flatMap((item) => item.channels)) {
        if (!fallbackBrands.some((brand) => channel.name.toLowerCase().includes(brand.toLowerCase()))) continue;
        if (country && channel.country !== country) continue;
        if (category && !channel.categories.some((item) => item.toLowerCase() === category)) continue;
        if (!merged.has(channel.id)) {
          merged.set(channel.id, {
            id: channel.id,
            name: /wwe|wrestling/i.test(channel.name) ? "WWE Live TV" : channel.name,
            country: channel.country,
            categories: channel.categories.length ? channel.categories : ["sports"],
            logo: channel.logo,
            streamUrl: channel.streamUrl,
            quality: channel.quality || null,
            referrer: channel.referrer || null,
            userAgent: channel.userAgent || null,
            score: 0,
            provider: "iptv-org",
          });
        }
      }
      const channels = [...merged.values()].slice(0, limit);
      const ok = result.ok || channels.length > 0;
      return json({
        ok,
        total: Math.max(result.total, channels.length),
        channels,
        ...(!ok && result.error ? { error: result.error } : {}),
      }, ok ? 200 : 502);
    } catch (error) {
      const message = error instanceof Error ? error.message : "IPTV channel catalogue error";
      return json({ ok: false, total: 0, channels: [], error: message }, 502);
    }
  }

  if (url.pathname === "/api/tv/guide") {
    const channelId = url.searchParams.get("channel");
    const hours = Math.max(1, Math.min(48, Number(url.searchParams.get("hours") || "12") || 12));
    if (!channelId) return json({ ok: false, programmes: [], error: "Channel is required." }, 400);
    try {
      const iptvOrgProgrammes = await getIptvOrgGuide(channelId, hours).catch(() => []);
      const programmes = iptvOrgProgrammes.length > 0
        ? iptvOrgProgrammes
        : await getNexusGuide(channelId, hours);
      return json({ ok: true, channelId, programmes });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TV guide error";
      return json({ ok: false, programmes: [], error: message }, 502);
    }
  }

  return null;
}
