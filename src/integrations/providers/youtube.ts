import type { ProviderCandidate, ProviderSearchParams } from "./types";

/**
 * In-memory TTL cache for YouTube queries to prevent consuming quota on duplicate requests.
 */
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

/**
 * Direct YouTube Data API v3 search implementation using official endpoints.
 */
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
      error:
        "YouTube API key (YOUTUBE_API_KEY / VITE_YOUTUBE_API_KEY) is not configured in server environment",
    };
  }

  const query = params.query.trim();
  if (!query) {
    return { ok: true, count: 0, candidates: [] };
  }

  const limit = Math.min(Math.max(params.limit || 10, 1), 50);

  // Check cache
  const cacheKey = `${query}::${limit}::${params.feed || "all"}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const headers: Record<string, string> = {};
    if (options?.referer) {
      headers["Referer"] = options.referer;
    } else if (typeof window !== "undefined" && window.location?.origin) {
      headers["Referer"] = window.location.origin;
    }

    // 1. YouTube Data API v3 Search
    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      q: query,
      maxResults: String(limit),
      key: apiKey.trim(),
    });

    if (params.feed === "shorts") {
      searchParams.set("videoDuration", "short");
    } else {
      // Look for long videos (> 20 mins) for movie searches
      searchParams.set("videoDuration", "long");
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
    const res = await fetch(searchUrl, { headers });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      let errorMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errBody);
        const reason = parsed?.error?.errors?.[0]?.reason || "";
        const apiMsg = parsed?.error?.message || "";

        if (
          apiMsg.toLowerCase().includes("requests from referer") &&
          apiMsg.toLowerCase().includes("blocked")
        ) {
          errorMsg = `YouTube API Key Error: HTTP Referrer restrictions in Google Cloud Console are blocking this domain. Add your app domain (e.g., https://*.run.app/* or https://*.onrender.com/*) to Allowed Referrers in Google Cloud Console > APIs & Services > Credentials.`;
        } else if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
          errorMsg = "YouTube API daily quota exceeded. Please check Google Cloud Console.";
        } else if (reason === "keyInvalid" || apiMsg.toLowerCase().includes("api key not valid")) {
          errorMsg = "Invalid YouTube API key. Please check your Google Cloud credentials.";
        } else if (reason === "accessNotConfigured") {
          errorMsg =
            "YouTube Data API v3 is not enabled in your Google Cloud project. Please enable it in Google Cloud Console.";
        } else if (apiMsg) {
          errorMsg = `YouTube API Error (${res.status}): ${apiMsg}`;
        }
      } catch {
        if (errBody) errorMsg = `HTTP ${res.status}: ${errBody.slice(0, 100)}`;
      }
      return { ok: false, count: 0, candidates: [], error: errorMsg };
    }

    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      const emptyResult = { ok: true, count: 0, candidates: [] };
      searchCache.set(cacheKey, { timestamp: Date.now(), data: emptyResult });
      return emptyResult;
    }

    // 2. Fetch Rich Metadata (Duration, ViewCount, Definition, Tags) via videos.list in a single batched call
    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter(Boolean) as string[];

    const metadataMap: Record<
      string,
      {
        duration?: number | null;
        viewCount?: number | null;
        definition?: string | null;
        tags?: string[];
      }
    > = {};

    if (videoIds.length > 0) {
      try {
        const detailsParams = new URLSearchParams({
          part: "snippet,contentDetails,statistics",
          id: videoIds.join(","),
          key: apiKey.trim(),
        });
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`;
        const detailsRes = await fetch(detailsUrl, { headers });

        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          for (const item of detailsData.items || []) {
            const duration = parseIsoDuration(item.contentDetails?.duration || "");
            const rawViews = item.statistics?.viewCount;
            const viewCount = rawViews ? parseInt(rawViews, 10) || null : null;
            const definition = item.contentDetails?.definition || null;
            const tags = Array.isArray(item.snippet?.tags) ? item.snippet.tags : [];

            metadataMap[item.id] = {
              duration,
              viewCount,
              definition,
              tags,
            };
          }
        }
      } catch (durationErr) {
        console.warn("[YouTube Provider] Failed to batch fetch video metadata:", durationErr);
      }
    }

    // 3. Normalize into ProviderCandidate
    const candidates = items
      .filter((item: { id?: { videoId?: string } }) => Boolean(item.id?.videoId))
      .map(
        (item: {
          id: { videoId: string };
          snippet: {
            title: string;
            description?: string;
            thumbnails?: {
              maxres?: { url: string };
              high?: { url: string };
              medium?: { url: string };
              default?: { url: string };
            };
            channelTitle?: string;
            publishedAt?: string;
          };
        }): ProviderCandidate => {
          const videoId = item.id.videoId;
          const snippet = item.snippet;
          const meta = metadataMap[videoId] || {};

          const thumbnail =
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            null;

          const resolution = meta.definition === "hd" ? "HD" : meta.definition ? "SD" : null;

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
            tags: meta.tags && meta.tags.length ? meta.tags.slice(0, 8) : undefined,
            resolution,
          };
        },
      );

    const minDuration =
      typeof params.minDurationSeconds === "number"
        ? params.minDurationSeconds
        : params.feed === "shorts"
          ? 0
          : 2400; // Default 40 minutes (2400s) for movie searches

    const filteredCandidates = candidates.filter((c) => {
      if (
        minDuration > 0 &&
        typeof c.durationSeconds === "number" &&
        c.durationSeconds < minDuration
      ) {
        return false;
      }
      return true;
    });

    const result = { ok: true, count: filteredCandidates.length, candidates: filteredCandidates };
    searchCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error contacting YouTube";
    return { ok: false, count: 0, candidates: [], error: msg };
  }
}

/**
 * Searches YouTube with status feedback.
 * If running in a browser, queries the secure server proxy `/api/youtube/search` first;
 * falls back to direct API execution if running standalone or server-side.
 */
export async function searchYouTubeWithStatus(params: ProviderSearchParams): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  // If running in browser environment, try the backend API endpoint to keep keys server-side
  if (typeof window !== "undefined") {
    try {
      const searchParams = new URLSearchParams({
        q: params.query,
        limit: String(params.limit || 12),
      });
      if (params.feed) {
        searchParams.set("feed", params.feed);
      }

      const res = await fetch(`/api/youtube/search?${searchParams.toString()}`);
      const data = (await res.json().catch(() => null)) as {
        ok: boolean;
        count: number;
        candidates: ProviderCandidate[];
        error?: string;
      } | null;

      if (data && typeof data.ok === "boolean") {
        return data;
      }
    } catch {
      // Fall through to direct execution
    }
  }

  // Direct execution (server runtime or fallback)
  return executeYouTubeApiSearch(params);
}

export async function searchYouTube(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const res = await searchYouTubeWithStatus(params);
  return res.candidates;
}
