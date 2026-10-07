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

  loading = Promise.allSettled(PLAYLISTS.map((path) => fetchPlaylist(path)))
    .then((results) => {
      const byId = new Map<string, Parsed>();
      let successfulPlaylists = 0;

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        successfulPlaylists += 1;

        for (const channel of result.value) {
          const existing = byId.get(channel.id);
          if (!existing || qualityScore(channel) > qualityScore(existing)) {
            byId.set(channel.id, channel);
          }
        }
      }

      if (successfulPlaylists === 0) {
        throw new Error("IPTV-org returned no accessible playlists");
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

    const candidatesToVerify = filtered.slice(0, Math.min(filtered.length, Math.max(limit * 3, 30)));
    const verified = await Promise.all(
      candidatesToVerify.map(async (channel) => {
        const playback = await getIptvPlaybackInfo(channel.id);
        return playback ? { channel, playback } : null;
      }),
    );
    const playable = verified.filter(
      (entry): entry is { channel: Parsed; playback: NonNullable<Awaited<ReturnType<typeof getIptvPlaybackInfo>>> } =>
        Boolean(entry),
    );

    const result: IptvChannel[] = playable.slice(0, limit).map(({ channel, playback }) => ({
      id: channel.id,
      name: channel.name,
      country: channel.country,
      categories: [categoryFromGroup(channel.group)],
      network: null,
      logo: channel.logo,
      streamUrl: playback.streamUrl,
      streamTitle: channel.name,
      quality: channel.quality,
      referrer: playback.referrer,
      userAgent: playback.userAgent,
      labels: [],
    }));

    return { ok: true, total: playable.length, channels: result };
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



type IptvStreamMeta = {
  channel: string | null;
  feed: string | null;
  url: string;
  referrer: string | null;
  user_agent: string | null;
  labels?: string[];
};

let streamMetaCache: { streams: IptvStreamMeta[]; expiresAt: number } | null = null;
let streamMetaLoading: Promise<IptvStreamMeta[]> | null = null;

async function loadStreamMetadata(): Promise<IptvStreamMeta[]> {
  if (streamMetaCache && streamMetaCache.expiresAt > Date.now()) return streamMetaCache.streams;
  if (streamMetaLoading) return streamMetaLoading;
  streamMetaLoading = fetch(`${IPTV_BASE.replace("/iptv", "")}/api/streams.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`IPTV-org streams API failed: ${res.status}`);
      const data = (await res.json()) as unknown;
      const streams = Array.isArray(data) ? (data as IptvStreamMeta[]) : [];
      streamMetaCache = { streams, expiresAt: Date.now() + CACHE_TTL_MS };
      return streams;
    })
    .finally(() => {
      streamMetaLoading = null;
    });
  return streamMetaLoading;
}

type IptvPlaybackCandidate = {
  streamUrl: string;
  referrer: string | null;
  userAgent: string | null;
  quality: string | null;
  labels: string[];
};

const playbackHealthCache = new Map<string, { ok: boolean; expiresAt: number }>();
const PLAYBACK_HEALTH_TTL_MS = 5 * 60 * 1000;

function candidateScore(stream: IptvStreamMeta, preferredUrl: string): number {
  let score = stream.url === preferredUrl ? 1000 : 0;
  const labels = stream.labels || [];
  if (!labels.includes("Geo-blocked")) score += 100;
  if (!labels.includes("Not 24/7")) score += 20;
  const quality = stream.quality?.match(/(\\d{3,4})p/i)?.[1];
  score += quality ? Number(quality) / 100 : 0;
  return score;
}

async function getIptvPlaybackCandidates(channelId: string): Promise<IptvPlaybackCandidate[]> {
  const channel = await getIptvChannel(channelId);
  if (!channel) return [];
  const streams = await loadStreamMetadata();
  const baseId = channelId.split("@")[0];
  return streams
    .filter((s) => s.channel === channelId || s.channel === baseId)
    .filter((s) => /^https?:\\/\\//i.test(s.url))
    .map((s) => ({
      streamUrl: s.url,
      referrer: s.referrer || null,
      userAgent: s.user_agent || null,
      quality: s.quality || null,
      labels: s.labels || [],
      _score: candidateScore(s, channel.streamUrl),
    }))
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...candidate }) => candidate);
}

async function probeIptvStream(candidate: IptvPlaybackCandidate): Promise<boolean> {
  const cached = playbackHealthCache.get(candidate.streamUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const headers = new Headers({
      Accept: "*/*",
      "User-Agent": candidate.userAgent || "Mozilla/5.0",
    });
    if (candidate.referrer) headers.set("Referer", candidate.referrer);

    const response = await fetch(candidate.streamUrl, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      playbackHealthCache.set(candidate.streamUrl, { ok: false, expiresAt: Date.now() + PLAYBACK_HEALTH_TTL_MS });
      return false;
    }

    const contentType = response.headers.get("content-type") || "";
    const looksLikeHls =
      /mpegurl/i.test(contentType) || /\\.m3u8(?:[?#]|$)/i.test(candidate.streamUrl);
    let ok = looksLikeHls || /video\\//i.test(contentType) || /octet-stream/i.test(contentType);

    if (looksLikeHls) {
      const text = await response.text();
      ok = ok && text.includes("#EXTM3U");
    } else {
      // Avoid downloading an entire video just to verify it responds.
      try { await response.body?.cancel(); } catch {}
    }

    playbackHealthCache.set(candidate.streamUrl, { ok, expiresAt: Date.now() + PLAYBACK_HEALTH_TTL_MS });
    return ok;
  } catch {
    playbackHealthCache.set(candidate.streamUrl, { ok: false, expiresAt: Date.now() + PLAYBACK_HEALTH_TTL_MS });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getIptvPlaybackInfo(channelId: string): Promise<{
  streamUrl: string;
  referrer: string | null;
  userAgent: string | null;
} | null> {
  try {
    const candidates = await getIptvPlaybackCandidates(channelId);
    for (const candidate of candidates) {
      // Labels are advisory, not an automatic rejection: a stream can still
      // work from XoraTV's Render region, so health-check the actual endpoint.
      if (await probeIptvStream(candidate)) {
        return {
          streamUrl: candidate.streamUrl,
          referrer: candidate.referrer,
          userAgent: candidate.userAgent,
        };
      }
    }
    return null;
  } catch {
    const channel = await getIptvChannel(channelId);
    return channel
      ? { streamUrl: channel.streamUrl, referrer: null, userAgent: null }
      : null;
  }
}

export async function getIptvStreamUrl(channelId: string): Promise<string | null> {
  const channel = await getIptvChannel(channelId.replace(/^iptv_/, ""));
  return channel?.streamUrl || null;
}
