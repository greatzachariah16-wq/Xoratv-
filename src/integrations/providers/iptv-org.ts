/**
 * IPTV-org provider for XoraTV Live TV.
 *
 * Uses IPTV-org's generated public M3U playlists. These playlists contain
 * the best available stream per channel and are much lighter to consume
 * than downloading every API dataset on every Render request.
 */

import type { XTvSeriesItem } from "../firebase/rtdb";

const IPTV_BASE = "https://iptv-org.github.io/iptv";
const CACHE_TTL_MS = 10 * 60 * 1000;

// Start with Xora's core African market plus major international TV sources.
// IPTV-org publishes these playlists officially and regenerates them daily.
const PLAYLISTS = [
  "regions/afr.m3u",
  "countries/ng.m3u",
  "countries/gh.m3u",
  "countries/ke.m3u",
  "countries/za.m3u",
  "countries/gb.m3u",
  "countries/us.m3u",
];

type Parsed = {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  country?: string;
  streamUrl: string;
  quality?: string;
};

let cache: { channels: Parsed[]; expiresAt: number } | null = null;
let loading: Promise<Parsed[]> | null = null;

function parseAttributes(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) out[match[1]] = match[2];
  return out;
}

function inferCountry(group = "", id = ""): string | undefined {
  const code = id.match(/\.([a-z]{2})(?:@|$)/i)?.[1] || group.match(/(?:^|\s)([A-Z]{2})(?:\s|$)/)?.[1];
  return code?.toUpperCase();
}

function qualityScore(channel: Parsed): number {
  const match = channel.quality?.match(/(\d{3,4})p/i);
  return match ? Number(match[1]) : 0;
}

function parseM3U(text: string): Parsed[] {
  const lines = text.split(/\r?\n/);
  const result: Parsed[] = [];

  for (let i = 0; i < lines.length; i++) {
    const info = lines[i]?.trim();
    if (!info?.startsWith("#EXTINF:")) continue;

    const url = lines[i + 1]?.trim();
    if (!url || url.startsWith("#") || !/^https?:\/\//i.test(url)) continue;

    const attrs = parseAttributes(info);
    const comma = info.indexOf(",");
    const name = (comma >= 0 ? info.slice(comma + 1).trim() : attrs["tvg-name"] || "").trim();
    const id = (attrs["tvg-id"] || name).trim();
    if (!name || !id) continue;

    const group = attrs["group-title"] || undefined;
    const quality = name.match(/\((\d{3,4}p)\)/i)?.[1];

    result.push({
      id,
      name,
      logo: attrs["tvg-logo"] || undefined,
      group,
      country: inferCountry(group, id),
      streamUrl: url,
      quality,
    });
  }

  return result;
}

async function fetchPlaylist(path: string): Promise<Parsed[]> {
  const res = await fetch(`${IPTV_BASE}/${path}`, {
    headers: { Accept: "audio/x-mpegurl,text/plain;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`IPTV-org playlist request failed: ${res.status}`);
  return parseM3U(await res.text());
}

async function loadChannels(): Promise<Parsed[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.channels;
  if (loading) return loading;

  loading = Promise.all(PLAYLISTS.map((path) => fetchPlaylist(path)))
    .then((lists) => {
      const byId = new Map<string, Parsed>();

      for (const list of lists.flat()) {
        const existing = byId.get(list.id);
        if (!existing || qualityScore(list) > qualityScore(existing)) {
          byId.set(list.id, list);
        }
      }

      const channels = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      cache = { channels, expiresAt: Date.now() + CACHE_TTL_MS };
      loading = null;
      return channels;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });

  return loading;
}

export interface IptvChannel {
  id: string;
  name: string;
  country?: string;
  categories: string[];
  network?: string | null;
  logo?: string;
  feedId?: string;
  feedName?: string;
  streamUrl: string;
  streamTitle: string;
  quality?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  labels: string[];
}

function categoryFromGroup(group?: string): string {
  const value = (group || "").toLowerCase();
  if (value.includes("news")) return "news";
  if (value.includes("sport")) return "sports";
  if (value.includes("movie") || value.includes("film")) return "movies";
  if (value.includes("music")) return "music";
  if (value.includes("kids") || value.includes("children")) return "kids";
  return "general";
}

export async function fetchIptvChannels(options?: {
  query?: string;
  country?: string;
  category?: string;
  limit?: number;
}): Promise<{ ok: boolean; total: number; channels: IptvChannel[]; error?: string }> {
  try {
    const channels = await loadChannels();
    const query = options?.query?.trim().toLowerCase() || "";
    const country = options?.country?.trim().toUpperCase() || "";
    const category = options?.category?.trim().toLowerCase() || "";
    const limit = Math.min(Math.max(options?.limit || 30, 1), 100);

    const filtered = channels.filter((channel) => {
      if (query && !channel.name.toLowerCase().includes(query) && !channel.id.toLowerCase().includes(query)) {
        return false;
      }
      if (country && channel.country !== country) return false;
      if (category && categoryFromGroup(channel.group) !== category) return false;
      return true;
    });

    const result: IptvChannel[] = filtered.slice(0, limit).map((channel) => ({
      id: channel.id,
      name: channel.name,
      country: channel.country,
      categories: [categoryFromGroup(channel.group)],
      network: null,
      logo: channel.logo,
      streamUrl: channel.streamUrl,
      streamTitle: channel.name,
      quality: channel.quality,
      referrer: null,
      userAgent: null,
      labels: [],
    }));

    return { ok: true, total: filtered.length, channels: result };
  } catch (err) {
    return {
      ok: false,
      total: 0,
      channels: [],
      error: err instanceof Error ? err.message : "Unable to retrieve IPTV-org channels",
    };
  }
}

export async function getIptvChannel(channelId: string): Promise<IptvChannel | null> {
  const result = await fetchIptvChannels({ query: channelId, limit: 100 });
  return result.channels.find((channel) => channel.id === channelId) || null;
}

export async function discoverIptvChannels(): Promise<XTvSeriesItem[]> {
  const result = await fetchIptvChannels({ limit: 100 });
  const tones: Array<"clay" | "sage" | "ink" | "sand"> = ["clay", "sage", "ink", "sand"];

  return result.channels.map((channel, index) => ({
    id: `iptv_${channel.id}`,
    title: channel.name,
    description: `Live TV from ${channel.country || "international"} broadcast network.`,
    genre: channel.categories[0] || "General",
    year: new Date().getFullYear(),
    seasons: 1,
    episodesCount: 1,
    tag: "Live TV",
    tone: tones[index % tones.length],
    videoUrl: channel.streamUrl,
    thumbnailUrl: channel.logo,
    provider: "iptv-org",
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
    categories: channel.categories,
  }));
}

export async function getIptvStreamUrl(channelId: string): Promise<string | null> {
  const channel = await getIptvChannel(channelId.replace(/^iptv_/, ""));
  return channel?.streamUrl || null;
}
