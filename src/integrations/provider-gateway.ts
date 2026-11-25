/**
 * XoraTV provider gateway.
 *
 * External catalogue and EPG providers are called only from this backend
 * boundary. Route handlers and UI-facing services consume normalized XoraTV
 * responses instead of coupling themselves to individual provider APIs.
 */
import { fetchIptvChannels } from "./providers/iptv-org";
import { getIptvOrgGuide } from "./providers/iptv-org-epg";
import { fetchNexusChannels, getNexusGuide } from "./providers/iptv-nexus";

type ChannelOptions = {
  category?: string;
  platform?: "native" | "web";
  query?: string;
  country?: string;
  limit: number;
};

export async function getTvChannels(options: ChannelOptions) {
  const { category = "", platform = "web", query, country, limit } = options;
  if (category === "movies" || category === "series") {
    const result = await fetchIptvChannels({ query, country, category, limit, platform });
    return {
      ok: result.ok,
      total: result.total,
      channels: result.channels.map((channel) => ({ ...channel, provider: "iptv-org" as const })),
      ...(result.error ? { error: result.error } : {}),
    };
  }

  const result = await fetchNexusChannels({ query, country, category: category || undefined, limit, platform });
  const fallbackBrands = category === "sports"
    ? ["ESPN", "SuperSport"]
    : query && /espn/i.test(query)
      ? ["ESPN"]
      : query && /supersport/i.test(query)
        ? ["SuperSport"]
        : [];
  const fallbacks = await Promise.all(fallbackBrands.map((brand) =>
    fetchIptvChannels({ query: brand, limit: 100, platform })
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
  return {
    ok,
    total: Math.max(result.total, channels.length),
    channels,
    ...(!ok && result.error ? { error: result.error } : {}),
  };
}

export async function getTvGuide(channelId: string, hours: number) {
  const providerErrors: string[] = [];
  try {
    const programmes = await getIptvOrgGuide(channelId, hours);
    if (programmes.length) return { programmes, source: "iptv-org" as const };
  } catch (error) {
    providerErrors.push(error instanceof Error ? error.message : "IPTV-org guide unavailable");
  }

  try {
    const programmes = await getNexusGuide(channelId, hours);
    return {
      programmes,
      source: programmes.length ? "iptv-nexus" as const : "none" as const,
      ...(providerErrors.length ? { warning: "Primary guide provider unavailable; fallback checked." } : {}),
    };
  } catch (error) {
    providerErrors.push(error instanceof Error ? error.message : "IPTV Nexus guide unavailable");
    // EPG is optional metadata: an unavailable guide must not break Live TV,
    // the API gateway, or the rest of the application.
    console.warn("[XoraTV provider gateway] EPG providers unavailable", {
      channelId,
      providers: providerErrors.length,
    });
    return {
      programmes: [],
      source: "none" as const,
      warning: "TV guide data is temporarily unavailable.",
    };
  }
}
