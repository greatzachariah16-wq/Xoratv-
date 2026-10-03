import type { ProviderCandidate, ProviderSearchParams } from "./types";

interface CacheEntry {
  timestamp: number;
  data: {
    ok: boolean;
    count: number;
    candidates: ProviderCandidate[];
    error?: string;
  };
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function unescapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&apos;/g, "'");
}

function parseIsoDuration(durationStr: string): number | null {
  if (!durationStr) return null;
  const match = durationStr.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export async function executeYouTubeApiSearch(
  params: ProviderSearchParams,
  options?: { apiKey?: string; referer?: string },
): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  const apiKey =
    options?.apiKey ||
    (typeof process !== "undefined" &&
      (process.env?.YOUTUBE_API_KEY || process.env?.VITE_YOUTUBE_API_KEY)) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_YOUTUBE_API_KEY) ||
    "";

  if (!apiKey || apiKey.trim() === "") {
    return {
      ok: false,
      count: 0,
      candidates: [],
      error: "YouTube API key is not configured in server environment",
    };
  }

  const query = params.query.trim();
  if (!query) return { ok: true, count: 0, candidates: [] };

  const limit = Math.min(Math.max(params.limit || 10, 1), 50);
  const cacheKey = `${query}::${limit}::${params.feed || "all"}::${params.order || "relevance"}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  try {
    const headers: Record<string, string> = {};
    if (options?.referer) headers.Referer = options.referer;

    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      q: query,
      maxResults: String(limit),
      key: apiKey.trim(),
      order: params.order || "relevance",
      videoDuration: params.feed === "shorts" ? "short" : "long",
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      { headers },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        const reason = parsed?.error?.errors?.[0]?.reason || "";
        const apiMsg = parsed?.error?.message || "";
        if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
          message = "YouTube API daily quota exceeded.";
        } else if (reason === "keyInvalid" || apiMsg.toLowerCase().includes("api key not valid")) {
          message = "Invalid YouTube API key.";
        } else if (reason === "accessNotConfigured") {
          message = "YouTube Data API v3 is not enabled.";
        } else if (apiMsg) {
          message = `YouTube API Error (${res.status}): ${apiMsg}`;
        }
      } catch {
        if (body) message = `HTTP ${res.status}: ${body.slice(0, 100)}`;
      }
      return { ok: false, count: 0, candidates: [], error: message };
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      const emptyResult = { ok: true, count: 0, candidates: [] };
      searchCache.set(cacheKey, { timestamp: Date.now(), data: emptyResult });
      return emptyResult;
    }

    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter(Boolean) as string[];

    const metadataMap: Record<string, {
      duration?: number | null;
      viewCount?: number | null;
      definition?: string | null;
      tags?: string[];
      isVertical?: boolean | null;
    }> = {};

    if (videoIds.length) {
      try {
        const detailsParams = new URLSearchParams({
          part: "snippet,contentDetails,statistics,status,player",
          id: videoIds.join(","),
          maxWidth: "720",
          maxHeight: "1280",
          key: apiKey.trim(),
        });
        const detailsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`,
          { headers },
        );
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          for (const item of detailsData.items || []) {
            const duration = parseIsoDuration(item.contentDetails?.duration || "");
            const rawViews = item.statistics?.viewCount;
            const embedWidth = Number(item.player?.embedWidth) || 0;
            const embedHeight = Number(item.player?.embedHeight) || 0;
            metadataMap[item.id] = {
              duration,
              viewCount: rawViews ? parseInt(rawViews, 10) || null : null,
              definition: item.contentDetails?.definition || null,
              tags: Array.isArray(item.snippet?.tags) ? item.snippet.tags : [],
              isVertical:
                embedWidth > 0 && embedHeight > 0 ? embedHeight >= embedWidth : null,
            };
          }
        }
      } catch (err) {
        console.warn("[YouTube Provider] Metadata lookup failed:", err);
      }
    }

    const candidates: ProviderCandidate[] = items
      .filter((item: { id?: { videoId?: string } }) => Boolean(item.id?.videoId))
      .map((item: any) => {
        const videoId = item.id.videoId;
        const snippet = item.snippet;
        const meta = metadataMap[videoId] || {};
        const thumbnail =
          snippet.thumbnails?.maxres?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          null;

        return {
          id: `yt-${videoId}`,
          provider: "youtube",
          title: unescapeHtml(snippet.title || "Untitled YouTube Video"),
          description: snippet.description ? unescapeHtml(snippet.description) : null,
          thumbnailUrl: thumbnail,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          durationSeconds: meta.duration ?? null,
          channelName: snippet.channelTitle ? unescapeHtml(snippet.channelTitle) : null,
          publishedAt: snippet.publishedAt || null,
          viewCount: meta.viewCount ?? null,
          tags: meta.tags?.length ? meta.tags.slice(0, 8) : undefined,
          resolution: meta.definition === "hd" ? "HD" : meta.definition ? "SD" : null,
          isVertical: meta.isVertical ?? null,
        } as ProviderCandidate;
      });

    const minDuration =
      typeof params.minDurationSeconds === "number"
        ? params.minDurationSeconds
        : params.feed === "shorts"
          ? 0
          : 2400;

    const filteredCandidates = candidates.filter(
      (candidate) =>
        !(minDuration > 0) ||
        typeof candidate.durationSeconds !== "number" ||
        candidate.durationSeconds >= minDuration,
    );

    const result = {
      ok: true,
      count: filteredCandidates.length,
      candidates: filteredCandidates,
    };
    searchCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    return {
      ok: false,
      count: 0,
      candidates: [],
      error: err instanceof Error ? err.message : "Network error contacting YouTube",
    };
  }
}

export async function searchYouTubeWithStatus(params: ProviderSearchParams) {
  if (typeof window !== "undefined") {
    try {
      const searchParams = new URLSearchParams({
        q: params.query,
        limit: String(params.limit || 12),
      });
      if (params.feed) searchParams.set("feed", params.feed);
      if (params.order) searchParams.set("order", params.order);

      const res = await fetch(`/api/youtube/search?${searchParams.toString()}`);
      const data = await res.json().catch(() => null);
      // Only trust the server response when it actually returned candidates.
      // If the server is missing its key, quota-limited, or otherwise failed,
      // fall through to the VITE client key instead of turning the feed blank.
      if (data && data.ok === true && Array.isArray(data.candidates) && data.candidates.length > 0) {
        return data;
      }
    } catch {
      // Fall through to the direct YouTube API path below.
    }
  }
  return executeYouTubeApiSearch(params);
}

export async function searchYouTube(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const result = await searchYouTubeWithStatus(params);
  return result.candidates;
}

export async function searchRecentYouTubeFeed(
  feed: "home" | "shorts",
  limit = 12,
): Promise<ProviderCandidate[]> {
  if (feed === "home") {
    const result = await searchYouTubeWithStatus({
      query: "horror fantasy supernatural movie",
      limit,
      feed,
      order: "date",
      minDurationSeconds: 2400,
    });

    return result.candidates.filter(
      (candidate) =>
        candidate.provider === "youtube" &&
        Boolean(candidate.thumbnailUrl) &&
        Boolean(candidate.embedUrl) &&
        typeof candidate.durationSeconds === "number" &&
        candidate.durationSeconds >= 2400,
    );
  }

  // Keep Shorts discovery to one cheap, recent YouTube search. Multiple search.list
  // calls were consuming quota rapidly and could make the entire Shorts feed fail.
  const result = await searchYouTubeWithStatus({
    query: "#shorts",
    limit: Math.min(limit, 24),
    feed: "shorts",
    order: "date",
  });

  if (!result.ok) {
    console.warn("[YouTube Shorts] Discovery failed:", result.error || "unknown error");
    return [];
  }

  return (result.candidates || [])
    .filter(
      (candidate) =>
        candidate.provider === "youtube" &&
        Boolean(candidate.thumbnailUrl) &&
        Boolean(candidate.embedUrl) &&
        (typeof candidate.durationSeconds !== "number" || candidate.durationSeconds <= 180),
    )
    .sort(
      (a, b) =>
        new Date(b.publishedAt || 0).getTime() -
        new Date(a.publishedAt || 0).getTime(),
    )
    .slice(0, limit);
}
