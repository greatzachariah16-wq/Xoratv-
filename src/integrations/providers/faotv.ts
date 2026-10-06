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
  streamUrl?: string;
  url?: string;
  streams?: Array<{ url?: string; streamUrl?: string } | string>;
}

export interface FaoTvSearchResult {
  ok: boolean;
  total: number;
  channels: FaoTvChannel[];
  error?: string;
}

const DEFAULT_API_BASE = "https://teamraven.online/api/v1";

function getApiBase(): string {
  return (process.env.FAOTV_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function getChannelsUrl(): string {
  return (
    process.env.FAOTV_CHANNELS ||
    getApiBase() + "/channels"
  );
}

function getApiKey(): string | null {
  return process.env.FAOTV_API_KEY || null;
}

function normalizeChannel(value: unknown): FaoTvChannel | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id ?? item.channelId ?? item.channel_id ?? "").trim();
  const name = String(item.name ?? item.title ?? item.channel_name ?? "").trim();
  if (!id || !name) return null;

  const group = String(item.group ?? item.category ?? item.genre ?? "").trim() || undefined;
  const logo = String(item.logo ?? item.logoUrl ?? item.logo_url ?? "").trim() || undefined;

  return {
    id,
    name,
    group,
    logo,
    latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : undefined,
    lg: typeof item.lg === "object" && item.lg ? (item.lg as FaoTvChannel["lg"]) : undefined,
    streamUrl: String(item.streamUrl ?? item.stream_url ?? "").trim() || undefined,
    url: String(item.url ?? "").trim() || undefined,
    streams: Array.isArray(item.streams)
      ? item.streams
          .map((stream) => {
            if (typeof stream === "string") return stream;
            if (stream && typeof stream === "object") {
              const s = stream as Record<string, unknown>;
              return {
                url: String(s.url ?? "").trim() || undefined,
                streamUrl: String(s.streamUrl ?? s.stream_url ?? "").trim() || undefined,
              };
            }
            return null;
          })
          .filter(Boolean) as FaoTvChannel["streams"]
      : undefined,
  };
}

function extractChannels(data: unknown): FaoTvChannel[] {
  if (Array.isArray(data)) {
    return data.map(normalizeChannel).filter(Boolean) as FaoTvChannel[];
  }

  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;

  const candidates = [
    root.channels,
    root.list,
    root.data,
    root.results,
    root.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeChannel).filter(Boolean) as FaoTvChannel[];
    }
    if (candidate && typeof candidate === "object") {
      const nested = extractChannels(candidate);
      if (nested.length) return nested;
    }
  }

  const single = normalizeChannel(root);
  return single ? [single] : [];
}

function buildHeaders(): Record<string, string> {
  const key = getApiKey();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "XoraTV/1.0 (Live TV)",
  };
  if (key) {
    headers["X-API-Key"] = key;
    headers.Authorization = "Bearer " + key;
  }
  return headers;
}

export async function fetchFaoTvChannels(options?: {
  query?: string;
  group?: string;
  limit?: number;
}): Promise<FaoTvSearchResult> {
  const q = options?.query?.trim() || "";
  const group = options?.group?.trim() || "";
  const limit = Math.min(60, Math.max(1, options?.limit || 30));
  const key = getApiKey();
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (group) query.set("group", group);
  query.set("limit", String(limit));
  if (key) query.set("api_key", key);

  const base = getApiBase().replace(/\/+$/, "");
  const configured = process.env.FAOTV_CHANNELS?.trim();
  const endpoints = [
    configured,
    base + "/channels",
    base + "/channels.json",
    base + "/api/channels",
    base + "/api/channels.json",
    "https://teamraven.online/api/channels",
    "https://teamraven.online/api/channels.json",
  ].filter((url, index, list): url is string => Boolean(url) && list.indexOf(url) === index);

  for (const endpoint of endpoints) {
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(
        endpoint + separator + query.toString(),
        { headers: buildHeaders(), signal: AbortSignal.timeout(8000) },
      );

      if (!response.ok) {
        console.warn("[FaoTV] channel endpoint", endpoint, "returned", response.status);
        continue;
      }

      const payload = await response.json();
      const channels = extractChannels(payload).slice(0, limit);
      if (channels.length) {
        return { ok: true, total: channels.length, channels };
      }
    } catch (error) {
      console.warn("[FaoTV] channel endpoint failed", endpoint, error);
    }
  }

  // Some FaoTV builds expose the catalogue through the public web page rather
  // than the JSON endpoint. Keep this as a compatibility fallback so XoraTV
  // can still discover the same public channel directory.
  try {
    const response = await fetch("https://teamraven.online/", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; XoraTV/1.0; Live TV)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const html = await response.text();
      const channels: FaoTvChannel[] = [];
      const seen = new Set<string>();
      const pattern = /href=["']\\/watch\\/([^"'?\\/]+)[^"']*["'][^>]*>([\\s\\S]{0,300}?)<\\/a>/gi;

      for (const match of html.matchAll(pattern)) {
        const id = match[1]?.trim();
        const rawLabel = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!id || !rawLabel || seen.has(id)) continue;
        if (q && !rawLabel.toLowerCase().includes(q.toLowerCase())) continue;
        seen.add(id);
        channels.push({ id, name: rawLabel });
        if (channels.length >= limit) break;
      }

      if (channels.length) {
        return { ok: true, total: channels.length, channels };
      }
    }
  } catch (error) {
    console.warn("[FaoTV] public catalogue fallback failed", error);
  }

  return {
    ok: false,
    total: 0,
    channels: [],
    error: "FaoTV returned no usable channels",
  };
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
  if (url.startsWith("/") && /\.m3u8(?:[?#]|$)/i.test(url)) {
    return "https://teamraven.online" + url;
  }
  return null;
}

function extractStreamCandidates(data: unknown): string[] {
  const found: string[] = [];

  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      const stream = normalizeStreamUrl(value);
      if (stream) found.push(stream);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (/stream|url|source|file/i.test(key)) visit(item);
      }
    }
  };

  visit(data);
  return [...new Set(found)];
}

/** Resolve the actual HLS manifest from the provider API first, then the watch page. */
export async function getFaoTvStreamUrl(channelId: string): Promise<string | null> {
  const id = channelId.trim().replace(/^fao_/, "");
  if (!id) return null;

  // Prefer a documented/detail API response when the provider exposes the
  // stream there. This avoids scraping the watch page unnecessarily.
  try {
    const response = await fetch(
      getApiBase() + "/channels/" + encodeURIComponent(id),
      { headers: buildHeaders(), signal: AbortSignal.timeout(8000) },
    );
    if (response.ok) {
      const streams = extractStreamCandidates(await response.json());
      if (streams[0]) return streams[0];
    }
  } catch (error) {
    console.warn("[FaoTV] channel detail lookup failed", error);
  }

  const watchUrl = "https://teamraven.online/watch/" + encodeURIComponent(id);
  try {
    const response = await fetch(watchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; XoraTV/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const html = await response.text();

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
  } catch (error) {
    console.warn("[FaoTV] stream resolution failed", error);
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
        "Live auto-verified broadcast from " + (ch.group || "FaoTV") + " network.",
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
