export interface Env {
  ALLOWED_ORIGINS?: string;
}

const PLAYLISTS = [
  { path: "index.m3u" },
  { path: "categories/kids.m3u", category: "kids" },
  { path: "categories/movies.m3u", category: "movies" },
  { path: "categories/series.m3u", category: "series" },
];
let cached: Array<Record<string, unknown>> | null = null;
let expiresAt = 0;
let loading: Promise<Array<Record<string, unknown>>> | null = null;

function parsePlaylist(text: string, playlistCategory?: string) {
  const lines = text.split(/\r?\n/);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < lines.length; i++) {
    const info = (lines[i] || "").trim();
    if (!info.startsWith("#EXTINF:")) continue;
    const streamUrl = (lines[i + 1] || "").trim();
    if (!/^https?:\/\//i.test(streamUrl)) continue;
    const attrs: Record<string, string> = {};
    const re = /([\w-]+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(info))) attrs[match[1]] = match[2];
    const comma = info.indexOf(",");
    const name = (comma >= 0 ? info.slice(comma + 1).trim() : attrs["tvg-name"] || "").trim();
    const id = (attrs["tvg-id"] || name).trim();
    if (!name || !id) continue;
    const group = attrs["group-title"] || "";
    const countryCode = id.match(/\.([a-z]{2})(?:@|$)/i)?.[1] || group.match(/(?:^|\s)([A-Z]{2})(?:\s|$)/)?.[1];
    rows.push({ id, name, logo: attrs["tvg-logo"] || null, group: group || null,
      country: countryCode?.toUpperCase() || null, streamUrl,
      quality: name.match(/\((\d{3,4}p)\)/i)?.[1] || null, playlistCategory: playlistCategory || null });
  }
  return rows;
}

function categoryOf(channel: Record<string, unknown>) {
  const name = String(channel.name || "");
  if (/wwe|wrestling/i.test(name)) return "sports";
  if (channel.playlistCategory) return channel.playlistCategory;
  const group = String(channel.group || "").toLowerCase();
  if (group.includes("news")) return "news";
  if (group.includes("sport")) return "sports";
  if (group.includes("movie") || group.includes("film")) return "movies";
  if (group.includes("music")) return "music";
  if (group.includes("kids") || group.includes("children")) return "kids";
  return "general";
}

async function getCatalogue() {
  if (cached && Date.now() < expiresAt) return cached;
  if (loading) return loading;
  loading = Promise.allSettled(PLAYLISTS.map(async (playlist) => {
    const response = await fetch("https://iptv-org.github.io/iptv/" + playlist.path);
    if (!response.ok) throw new Error("Playlist unavailable: " + response.status);
    return parsePlaylist(await response.text(), playlist.category);
  })).then((results) => {
    const byId = new Map<string, Record<string, unknown>>();
    let successful = 0;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      successful++;
      for (const channel of result.value) {
        const id = String(channel.id);
        const existing = byId.get(id);
        if (!existing || (channel.playlistCategory && !existing.playlistCategory)) byId.set(id, channel);
      }
    }
    if (!successful) throw new Error("No IPTV catalogue source responded");
    cached = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    expiresAt = Date.now() + 10 * 60 * 1000;
    loading = null;
    return cached;
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

function headers(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "https://xoratv-x.onrender.com").split(",").map(v => v.trim());
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, s-maxage=300",
    "x-content-type-options": "nosniff",
    ...(origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const responseHeaders = headers(request, env);
    if (request.method === "OPTIONS") {
      if (!responseHeaders["access-control-allow-origin"]) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        ...responseHeaders, "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization", "access-control-max-age": "86400",
      }});
    }
    if (request.method === "GET" && ["/health", "/api/health"].includes(url.pathname)) {
      return Response.json({ ok: true, service: "xoratv-edge-api", runtime: "cloudflare-workers" }, { headers: responseHeaders });
    }
    if (request.method === "GET" && url.pathname === "/api/tv/channels") {
      try {
        const all = await getCatalogue();
        const query = (url.searchParams.get("query") || "").trim().toLowerCase();
        const country = (url.searchParams.get("country") || "").trim().toUpperCase();
        const category = (url.searchParams.get("category") || "").trim().toLowerCase();
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 10000);
        const channels = all.filter(channel =>
          (!query || String(channel.name).toLowerCase().includes(query) || String(channel.id).toLowerCase().includes(query)) &&
          (!country || channel.country === country) &&
          (!category || categoryOf(channel) === category)
        ).slice(0, limit).map(channel => ({
          id: channel.id, name: channel.name, country: channel.country,
          categories: [categoryOf(channel)], logo: channel.logo, streamUrl: channel.streamUrl,
          streamTitle: channel.name, quality: channel.quality,
          labels: [channel.group, channel.playlistCategory].filter(Boolean),
        }));
        return Response.json({ ok: true, total: channels.length, channels, source: "iptv-org" }, { headers: responseHeaders });
      } catch {
        return Response.json({ ok: false, total: 0, channels: [], error: "The live TV catalogue is temporarily unavailable." },
          { status: 503, headers: responseHeaders });
      }
    }
    return Response.json({ ok: false, error: "Not found" }, { status: 404, headers: responseHeaders });
  },
};
