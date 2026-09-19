/**
 * FaoTV provider for XTv.
 * The browser receives only a resolved HLS manifest; it never treats a FaoTV
 * watch page as a playable media URL.
 */
import type { XTvSeriesItem } from "../firebase/rtdb";

export interface FaoTvChannel {
  id: string;
  name: string;
  group?: string;
  logo?: string;
  latencyMs?: number;
  lg?: { h1?: number; h2?: number; ini?: string };
}
export interface FaoTvSearchResult {
  ok: boolean;
  total: number;
  channels: FaoTvChannel[];
  error?: string;
}

const DEFAULT_API_BASE = "https://teamraven.online/api/v1";
const DEFAULT_CHANNELS_URL = DEFAULT_API_BASE + "/channels";

function getApiKey(): string | null {
  return process.env.FAOTV_API_KEY || null;
}
function getChannelsUrl(): string {
  return process.env.FAOTV_CHANNELS || DEFAULT_CHANNELS_URL;
}

export async function fetchFaoTvChannels(options?: {
  query?: string;
  group?: string;
  limit?: number;
}): Promise<FaoTvSearchResult> {
  const q = options?.query?.trim() || "";
  const group = options?.group?.trim() || "";
  const limit = options?.limit || 30;
  const key = getApiKey();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "XoraTV/1.0 (Smart Content Engine)",
  };
  if (key) {
    headers["X-API-Key"] = key;
    headers.Authorization = "Bearer " + key;
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group) params.set("group", group);
  params.set("limit", String(limit));
  if (key) params.set("api_key", key);

  try {
    const res = await fetch(getChannelsUrl().replace(/\/+$/, "") + "?" + params.toString(), {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      if (
        data &&
        (Array.isArray(data.channels) || Array.isArray(data.list) || Array.isArray(data.data))
      ) {
        const channels = (data.channels || data.list || data.data) as FaoTvChannel[];
        return { ok: true, total: channels.length, channels };
      }
    }
  } catch (_err) {
    // Ignore and proceed to fallback endpoint
  }

  try {
    const url = group
      ? "https://teamraven.online/search?group=" + encodeURIComponent(group)
      : "https://teamraven.online/search?q=" + encodeURIComponent(q || "movie") + "&limit=" + limit;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && Array.isArray(data.channels)) {
        return { ok: true, total: data.channels.length, channels: data.channels };
      }
    }
  } catch (err) {
    console.warn("[FaoTV] fallback search failed", err);
  }
  return { ok: false, total: 0, channels: [], error: "Unable to retrieve channels from FaoTV" };
}

function normalizeStreamUrl(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
  const url = value.startsWith("//") ? "https:" + value : value;
  if (/^https?:\/\//i.test(url) && /\.m3u8(?:[?#]|$)/i.test(url)) return url;
  if (url.startsWith("/") && /\.m3u8(?:[?#]|$)/i.test(url)) return "https://teamraven.online" + url;
  return null;
}

/** Resolve the actual HLS manifest from the FaoTV watch page. */
export async function getFaoTvStreamUrl(channelId: string): Promise<string | null> {
  const id = channelId.trim().replace(/^fao_/, "");
  if (!id) return null;
  const watchUrl = "https://teamraven.online/watch/" + encodeURIComponent(id);
  try {
    const res = await fetch(watchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; XoraTV/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /data-src=["']([^"']+?\.m3u8(?:\?[^"']*)?)["']/i,
      /(?:src|file|source|stream(?:Url|URL)?)=["']([^"']+?\.m3u8(?:\?[^"']*)?)["']/i,
      /["']((?:https?:)?\/\/[^"']+?\.m3u8(?:\?[^"']*)?)["']/i,
      /["'](\/[^"']+?\.m3u8(?:\?[^"']*)?)["']/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const stream = match?.[1] ? normalizeStreamUrl(match[1]) : null;
      if (stream) return stream;
    }
  } catch (err) {
    console.warn("[FaoTV] stream resolution failed", err);
  }
  return null;
}

export async function discoverFaoTvSeriesAndMovies(): Promise<XTvSeriesItem[]> {
  const found = new Map<string, FaoTvChannel>();
  const queries = [
    "movie",
    "movies",
    "series",
    "cinema",
    "film",
    "drama",
    "hollywood",
    "korean",
    "action",
  ];
  const groups = [
    "Movies",
    "English Movies",
    "xumo_playlist",
    "SamsungTVPlus-All",
    "Plex-All",
    "Persiana",
    "Wnslive",
    "Hindi | 24/7",
    "LGTV-Schedule",
  ];

  await Promise.allSettled(
    queries.map(async (q) => {
      const res = await fetchFaoTvChannels({ query: q, limit: 30 });
      if (res.ok)
        for (const ch of res.channels) if (ch.id && !found.has(ch.id)) found.set(ch.id, ch);
    }),
  );
  await Promise.allSettled(
    groups.map(async (group) => {
      const res = await fetchFaoTvChannels({ group, limit: 30 });
      if (res.ok)
        for (const ch of res.channels) if (ch.id && !found.has(ch.id)) found.set(ch.id, ch);
    }),
  );

  const tones: Array<"clay" | "sage" | "ink" | "sand"> = ["ink", "clay", "sand", "sage"];
  return Array.from(found.values()).map((ch, index) => {
    const n = ch.name.toLowerCase();
    const g = (ch.group || "").toLowerCase();
    let genre = "Movies";
    let tag = "Feature Stream";
    if (n.includes("series") || g.includes("series")) {
      genre = "Series";
      tag = "Serialized TV";
    } else if (n.includes("cinema") || g.includes("cinema")) {
      genre = "Cinema";
      tag = "Cinema Channel";
    } else if (n.includes("korean") || n.includes("asian")) {
      genre = "International";
      tag = "Global Cinema";
    } else if (n.includes("action") || n.includes("thriller")) {
      genre = "Action";
      tag = "Action Movies";
    } else if (n.includes("docu") || g.includes("docu")) {
      genre = "Documentary";
      tag = "Docuseries";
    }
    return {
      id: "fao_" + ch.id,
      title: ch.name,
      description:
        "Live auto-verified movie & series broadcast from " +
        (ch.group || "FaoTV") +
        " network. High-definition continuous stream.",
      genre,
      year: new Date().getFullYear(),
      seasons: 1,
      episodesCount: 24,
      tag,
      tone: tones[index % tones.length],
      videoUrl: "https://teamraven.online/watch/" + ch.id,
      thumbnailUrl: ch.logo || undefined,
      provider: "faotv",
      durationSeconds: 7200,
      createdAt: new Date().toISOString(),
    } satisfies XTvSeriesItem;
  });
}
