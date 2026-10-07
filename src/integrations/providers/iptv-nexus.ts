/**
 * IPTV Nexus provider for XoraTV Live TV.
 *
 * Nexus is a free, static, CDN-served IPTV index built on IPTV-org. It adds
 * stream health scoring and a channel-matched XMLTV EPG, which is what XoraTV
 * needs for a NOW / NEXT / upcoming TV experience.
 */

const NEXUS_BASE = "https://dearbulut.github.io/iptv";
const CHANNELS_TTL_MS = 10 * 60 * 1000;
const GUIDE_TTL_MS = 30 * 60 * 1000;

type NexusStream = {
  url?: string;
  title?: string;
  quality?: string | null;
  rank?: number;
  referrer?: string | null;
  user_agent?: string | null;
  health?: { status?: string; score?: number };
};

type NexusChannel = {
  id: string;
  name: string;
  country?: string | null;
  categories?: string[];
  languages?: string[];
  logo?: string | null;
  score?: number;
  online?: boolean;
  best_quality?: string | null;
  streams?: NexusStream[];
};

export type NexusTvChannel = {
  id: string;
  name: string;
  country?: string;
  categories: string[];
  logo?: string;
  streamUrl: string;
  quality?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  score?: number;
};

export type NexusProgramme = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

let channelsCache: { channels: NexusChannel[]; expiresAt: number } | null = null;
let channelsLoading: Promise<NexusChannel[]> | null = null;
const guideCache = new Map<string, { xml: string; expiresAt: number }>();

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .trim();
}

function xmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return match ? decodeXml(match[1]) : "";
}

function xmlAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp("\\b" + name + "=[\\\"']([^\\\"']+)[\\\"']", "i"));
  return match?.[1] || "";
}

function xmlTvDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:\d{2})?(?:\s+([+-]\d{4}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, offset] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00${offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : "Z"}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadChannels(): Promise<NexusChannel[]> {
  if (channelsCache && channelsCache.expiresAt > Date.now()) return channelsCache.channels;
  if (channelsLoading) return channelsLoading;

  channelsLoading = fetch(`${NEXUS_BASE}/api/v1/search.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`IPTV Nexus search request failed: ${response.status}`);
      const data = (await response.json()) as {
        fields?: string[];
        channels?: unknown[][];
      };

      const fields = Array.isArray(data.fields) ? data.fields : [];
      const rows = Array.isArray(data.channels) ? data.channels : [];
      const index = new Map(fields.map((field, i) => [field, i]));
      const get = (row: unknown[], field: string) => row[index.get(field) ?? -1];

      const candidates = rows
        .filter((row) => Array.isArray(row) && Boolean(get(row, "id")))
        .filter((row) => Boolean(get(row, "online")))
        .slice(0, 24);

      const details = await Promise.all(
        candidates.map(async (row) => {
          const id = String(get(row, "id"));
          try {
            const detailResponse = await fetch(`${NEXUS_BASE}/api/v1/channels/${encodeURIComponent(id)}.json`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(10000),
            });
            if (!detailResponse.ok) return null;
            return (await detailResponse.json()) as NexusChannel;
          } catch {
            return null;
          }
        }),
      );

      const channels = details.filter(
        (channel): channel is NexusChannel =>
          Boolean(channel?.id && channel.name && channel.online !== false && bestStream(channel)),
      );

      channelsCache = { channels, expiresAt: Date.now() + CHANNELS_TTL_MS };
      return channels;
    })
    .finally(() => {
      channelsLoading = null;
    });

  return channelsLoading;
}
function bestStream(channel: NexusChannel): NexusStream | null {
  const streams = (channel.streams || []).filter(
    (stream) =>
      stream?.url &&
      /^https?:\/\//i.test(stream.url) &&
      (stream.health?.status === undefined || stream.health.status === "online"),
  );
  return streams.sort((a, b) => {
    const scoreA = a.health?.score || 0;
    const scoreB = b.health?.score || 0;
    return scoreB - scoreA || (b.rank || 0) - (a.rank || 0);
  })[0] || null;
}
function toChannel(channel: NexusChannel): NexusTvChannel | null {
  const stream = bestStream(channel);
  if (!stream?.url || !/^https?:\/\//i.test(stream.url)) return null;
  return {
    id: channel.id,
    name: channel.name,
    country: channel.country || undefined,
    categories: channel.categories || [],
    logo: channel.logo || undefined,
    streamUrl: stream.url,
    quality: stream.quality || channel.best_quality || null,
    referrer: stream.referrer || null,
    userAgent: stream.user_agent || null,
    score: channel.score,
  };
}

export async function fetchNexusChannels(options?: {
  query?: string;
  country?: string;
  category?: string;
  limit?: number;
}): Promise<{ ok: boolean; total: number; channels: NexusTvChannel[]; error?: string }> {
  try {
    const all = await loadChannels();
    const query = options?.query?.trim().toLowerCase() || "";
    const country = options?.country?.trim().toUpperCase() || "";
    const category = options?.category?.trim().toLowerCase() || "";
    const limit = Math.min(Math.max(options?.limit || 30, 1), 100);

    const filtered = all.filter((channel) => {
      if (query && !channel.name.toLowerCase().includes(query) && !channel.id.toLowerCase().includes(query)) return false;
      if (country && channel.country !== country) return false;
      if (category && !(channel.categories || []).some((item) => item.toLowerCase() === category)) return false;
      return true;
    });

    const result = filtered
      .map(toChannel)
      .filter((channel): channel is NexusTvChannel => Boolean(channel))
      .sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name))
      .slice(0, limit);

    return { ok: true, total: filtered.length, channels: result };
  } catch (error) {
    return { ok: false, total: 0, channels: [], error: error instanceof Error ? error.message : "Unable to load IPTV Nexus" };
  }
}

export async function getNexusPlaybackCandidates(channelId: string, limit = 3): Promise<Array<{ streamUrl: string; referrer?: string | null; userAgent?: string | null }>> {
  const all = await loadChannels();
  const channel = all.find((item) => item.id === channelId);
  if (!channel) return [];
  return (channel.streams || [])
    .filter((stream) => stream?.url && /^https?:\\/\\//i.test(stream.url) && (stream.health?.status === undefined || stream.health.status === "online"))
    .sort((a, b) => (b.health?.score || 0) - (a.health?.score || 0) || (b.rank || 0) - (a.rank || 0))
    .slice(0, Math.max(1, limit))
    .map((stream) => ({ streamUrl: stream.url!, referrer: stream.referrer || null, userAgent: stream.user_agent || null }));
}

export async function getNexusChannel(channelId: string): Promise<NexusTvChannel | null> {
  const all = await loadChannels();
  return toChannel(all.find((channel) => channel.id === channelId) || { id: "", name: "" });
}

async function loadGuide(country?: string): Promise<string> {
  const key = country?.toLowerCase() || "global";
  const cached = guideCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.xml;

  const path = country ? `/epg/${country.toLowerCase()}.xml` : "/epg/guide.xml";
  const response = await fetch(NEXUS_BASE + path, {
    headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`IPTV Nexus EPG request failed: ${response.status}`);
  const xml = await response.text();
  guideCache.set(key, { xml, expiresAt: Date.now() + GUIDE_TTL_MS });
  return xml;
}

export async function getNexusGuide(channelId: string, hours = 12): Promise<NexusProgramme[]> {
  const channel = await getNexusChannel(channelId);
  if (!channel) return [];

  // Country shards keep memory and bandwidth much lower than the global guide.
  // Prefer the smaller country shard. Some Nexus channels are matched into
  // the merged guide but not their country shard, so fall back to the global
  // guide when the country shard contains no programmes for this channel.
  // Prefer the smaller country shard. Some Nexus channels are matched into
  // the merged guide but not their country shard, so fall back to the global
  // guide when the country shard contains no programmes for this channel.
  const xml = await loadGuide(channel.country);
  const now = Date.now();
  const end = now + Math.min(Math.max(hours, 1), 24) * 60 * 60 * 1000;
  const programmes: NexusProgramme[] = [];

  const pattern = /<programme\b[^>]*\bchannel=["']([^"']+)["'][^>]*>[\s\S]*?<\/programme>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    if (match[1] !== channelId) continue;
    const block = match[0];
    const startRaw = block.match(/\bstart=["']([^"']+)["']/i)?.[1] || "";
    const stopRaw = block.match(/\bstop=["']([^"']+)["']/i)?.[1] || "";
    const start = xmlTvDate(startRaw);
    const stop = xmlTvDate(stopRaw);
    if (!start || !stop || stop.getTime() < now || start.getTime() > end) continue;

    const title = xmlTag(block, "title") || "Programme";
    const description = xmlTag(block, "desc") || undefined;
    programmes.push({
      id: `${channelId}-${start.toISOString()}`,
      channelId,
      title,
      description,
      start: start.toISOString(),
      stop: stop.toISOString(),
      isLive: start.getTime() <= now && stop.getTime() > now,
    });
    if (programmes.length >= 24) break;
  }

  if (programmes.length === 0 && channel.country) {
    const globalXml = await loadGuide();
    const globalProgrammes: NexusProgramme[] = [];
    const globalPattern = /<programme\b[^>]*\bchannel=["']([^"']+)["'][^>]*>[\s\S]*?<\/programme>/gi;
    let globalMatch: RegExpExecArray | null;
    while ((globalMatch = globalPattern.exec(globalXml))) {
      if (globalMatch[1] !== channelId) continue;
      const block = globalMatch[0];
      const startRaw = block.match(/\bstart=["']([^"']+)["']/i)?.[1] || "";
      const stopRaw = block.match(/\bstop=["']([^"']+)["']/i)?.[1] || "";
      const start = xmlTvDate(startRaw);
      const stop = xmlTvDate(stopRaw);
      if (!start || !stop || stop.getTime() < now || start.getTime() > end) continue;
      globalProgrammes.push({
        id: channelId + "-" + start.toISOString(),
        channelId,
        title: xmlTag(block, "title") || "Programme",
        description: xmlTag(block, "desc") || undefined,
        start: start.toISOString(),
        stop: stop.toISOString(),
        isLive: start.getTime() <= now && stop.getTime() > now,
      });
      if (globalProgrammes.length >= 24) break;
    }
    return globalProgrammes.sort((a, b) => a.start.localeCompare(b.start));
  }

  return programmes.sort((a, b) => a.start.localeCompare(b.start));
}
