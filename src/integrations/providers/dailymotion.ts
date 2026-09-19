import type { ProviderCandidate, ProviderSearchParams } from "./types";

export async function searchDailymotionWithStatus(params: ProviderSearchParams): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  const query = params.query.trim();
  if (!query) {
    return { ok: true, count: 0, candidates: [] };
  }
  const limit = Math.min(params.limit || 10, 25);

  const apiKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_DAILYMOTION_API_KEY) ||
    (typeof process !== "undefined" && process.env?.DAILYMOTION_API_KEY) ||
    "";

  const fields = [
    "id",
    "title",
    "description",
    "created_time",
    "url",
    "thumbnail_720_url",
    "thumbnail_480_url",
    "duration",
    "owner.screenname",
    "tags",
  ].join(",");

  const searchUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=${fields}&limit=${limit}`;

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey && apiKey.trim() !== "" && !/^[a-f0-9]{20}$/i.test(apiKey.trim())) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    let res = await fetch(searchUrl, { headers });
    if (res.status === 401 && headers["Authorization"]) {
      delete headers["Authorization"];
      res = await fetch(searchUrl, { headers });
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      let errorMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.error?.message) errorMsg = `HTTP ${res.status}: ${parsed.error.message}`;
      } catch {
        if (errBody) errorMsg = `HTTP ${res.status}: ${errBody.slice(0, 80)}`;
      }
      return { ok: false, count: 0, candidates: [], error: errorMsg };
    }

    const data = await res.json();
    const items = data.list || [];

    const minDuration =
      typeof params.minDurationSeconds === "number"
        ? params.minDurationSeconds
        : params.feed === "shorts"
          ? 0
          : 2400; // Default 40 minutes (2400s) for movie searches

    const candidates = items
      .map(
        (item: {
          id: string;
          title: string;
          description?: string;
          url?: string;
          thumbnail_720_url?: string;
          thumbnail_480_url?: string;
          duration?: number;
          created_time?: number;
          "owner.screenname"?: string;
          tags?: string[];
        }): ProviderCandidate | null => {
          if (!item.id) return null;

          const thumbnail = item.thumbnail_720_url || item.thumbnail_480_url || null;
          const publishedDate = item.created_time
            ? new Date(item.created_time * 1000).toISOString()
            : null;

          return {
            id: `dm-${item.id}`,
            provider: "dailymotion",
            title: item.title || "Untitled Dailymotion Video",
            description: item.description || null,
            thumbnailUrl: thumbnail,
            embedUrl: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=0`,
            watchUrl: item.url || `https://www.dailymotion.com/video/${item.id}`,
            durationSeconds: typeof item.duration === "number" ? item.duration : null,
            channelName: item["owner.screenname"] || null,
            publishedAt: publishedDate,
            tags: Array.isArray(item.tags) ? item.tags : undefined,
          };
        },
      )
      .filter((item: ProviderCandidate | null): item is ProviderCandidate => {
        if (!item) return false;
        if (
          minDuration > 0 &&
          typeof item.durationSeconds === "number" &&
          item.durationSeconds < minDuration
        ) {
          return false;
        }
        return true;
      });

    return { ok: true, count: candidates.length, candidates };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, count: 0, candidates: [], error: msg };
  }
}

export async function searchDailymotion(
  params: ProviderSearchParams,
): Promise<ProviderCandidate[]> {
  const res = await searchDailymotionWithStatus(params);
  return res.candidates;
}
