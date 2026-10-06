/**
 * IPTV-org provider for XoraTV Live TV.
 *
 * Uses the documented IPTV-org API datasets:
 * channels.json, feeds.json, logos.json, streams.json and blocklist.json.
 * Channel IDs are the canonical identity; streams are linked by channel/feed.
 */

import type { XTvSeriesItem } from "../firebase/rtdb";

const API_BASE = "https://iptv-org.github.io/api";
const CACHE_TTL_MS = 5 * 60 * 1000;

type Channel = {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  country?: string;
  categories?: string[];
  is_nsfw?: boolean;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
};

type Feed = {
  channel: string;
  id: string;
  name: string;
  is_main?: boolean;
  broadcast_area?: string[];
  timezones?: string[];
  languages?: string[];
  format?: string;
};

type Logo = {
  channel: string;
  feed?: string | null;
  in_use?: boolean;
  tags?: string[];
  width?: number;
  height?: number;
  url: string;
};

type Stream = {
  channel?: string | null;
  feed?: string | null;
  title: string;
  url: string;
  referrer?: string | null;
  user_agent?: string | null;
  quality?: string | null;
  labels?: string[];
};

type ApiData = {
  channels: Channel[];
  feeds: Feed[];
  logos: Logo[];
  streams: Stream[];
  blocklist: Array<{ channel: string; reason?: string }>;
};

let cache: { data: ApiData; expiresAt: number } | null = null;
let loading: Promise<ApiData> | null = null;

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${name}.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`IPTV-org ${name} request failed: ${res.status}`);
  return (await res.json()) as T;
}

async function loadData(): Promise<ApiData> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  if (loading) return loading;

  loading = Promise.all([
    fetchJson<Channel[]>("channels"),
    fetchJson<Feed[]>("feeds"),
    fetchJson<Logo[]>("logos"),
    fetchJson<Stream[]>("streams"),
    fetchJson<Array<{ channel: string; reason?: string }>>("blocklist"),
  ]).then(([channels, feeds, logos, streams, blocklist]) => {
    const data = { channels, feeds, logos, streams, blocklist };
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    loading = null;
    return data;
  }).catch((err) => {
    loading = null;
    throw err;
  });

  return loading;
}

function qualityScore(quality?: string | null): number {
  if (!quality) return 0;
  const match = quality.match(/(\\d{3,4})p/i);
  return match ? Number(match[1]) : 0;
}

function streamScore(stream: Stream): number {
  const labels = new Set((stream.labels || []).map((x) => x.toLowerCase()));
  let score = qualityScore(stream.quality);

  if (labels.has("geo-blocked")) score -= 100000;
  if (labels.has("not 24/7")) score -= 1000;
  if (stream.url.startsWith("https://")) score += 20;
  if (/\\.m3u8(?:[?#]|$)/i.test(stream.url)) score += 10;
  return score;
}

function pickLogo(channelId: string, feedId: string | null, logos: Logo[]): string | undefined {
  const candidates = logos.filter(
    (logo) =>
      logo.channel === channelId &&
      (!feedId || logo.feed === feedId || logo.feed == null),
  );

  candidates.sort((a, b) => {
    const aScore = (a.feed === feedId ? 100 : 0) + (a.in_use ? 20 : 0) + (a.width || 0);
    const bScore = (b.feed === feedId ? 100 : 0) + (b.in_use ? 20 : 0) + (b.width || 0);
    return bScore - aScore;
  });

  return candidates[0]?.url;
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

export async function fetchIptvChannels(options?: {
  query?: string;
  country?: string;
  category?: string;
  limit?: number;
}): Promise<{ ok: boolean; total: number; channels: IptvChannel[]; error?: string }> {
  try {
    const data = await loadData();
    const query = options?.query?.trim().toLowerCase() || "";
    const country = options?.country?.trim().toUpperCase() || "";
    const category = options?.category?.trim().toLowerCase() || "";
    const limit = Math.min(Math.max(options?.limit || 30, 1), 100);

    const blocked = new Set(data.blocklist.map((item) => item.channel));
    const feedsByChannel = new Map<string, Feed[]>();
    const logosByChannel = new Map<string, Logo[]>();
    const streamsByChannel = new Map<string, Stream[]>();

    for (const feed of data.feeds) {
      const list = feedsByChannel.get(feed.channel) || [];
      list.push(feed);
      feedsByChannel.set(feed.channel, list);
    }
    for (const logo of data.logos) {
      const list = logosByChannel.get(logo.channel) || [];
      list.push(logo);
      logosByChannel.set(logo.channel, list);
    }
    for (const stream of data.streams) {
      if (!stream.channel || !stream.url) continue;
      const list = streamsByChannel.get(stream.channel) || [];
      list.push(stream);
      streamsByChannel.set(stream.channel, list);
    }

    const result: IptvChannel[] = [];

    for (const channel of data.channels) {
      if (channel.is_nsfw || channel.closed || blocked.has(channel.id)) continue;
      const streams = streamsByChannel.get(channel.id) || [];
      if (!streams.length) continue;

      const searchable = [channel.name, ...(channel.alt_names || []), channel.network || ""]
        .join(" ")
        .toLowerCase();
      if (query && !searchable.includes(query)) continue;
      if (country && channel.country !== country) continue;
      if (category && !(channel.categories || []).some((x) => x.toLowerCase() === category)) continue;

      const available = streams
        .filter((stream) => stream.url.startsWith("http"))
        .sort((a, b) => streamScore(b) - streamScore(a));

      const selected = available[0];
      if (!selected) continue;

      const feed = (feedsByChannel.get(channel.id) || []).find(
        (item) => item.id === selected.feed,
      ) || (feedsByChannel.get(channel.id) || []).find((item) => item.is_main);

      result.push({
        id: channel.id,
        name: channel.name,
        country: channel.country,
        categories: channel.categories || [],
        network: channel.network,
        logo: pickLogo(channel.id, selected.feed || null, logosByChannel.get(channel.id) || []),
        feedId: selected.feed || feed?.id,
        feedName: feed?.name,
        streamUrl: selected.url,
        streamTitle: selected.title,
        quality: selected.quality,
        referrer: selected.referrer,
        userAgent: selected.user_agent,
        labels: selected.labels || [],
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, total: result.length, channels: result.slice(0, limit) };
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
  const result = await fetchIptvChannels({ limit: 100 });
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
    tag: channel.network || "Live TV",
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
