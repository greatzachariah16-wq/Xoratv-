import type { ProviderCandidate, ProviderSearchParams } from "./types";

export async function searchDailymotion(
  params: ProviderSearchParams,
): Promise<ProviderCandidate[]> {
  const query = params.query.trim();
  if (!query) return [];
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
    if (apiKey && apiKey.trim() !== "") {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(searchUrl, { headers });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[Dailymotion Provider] API HTTP ${res.status}: ${errBody}`);
      return [];
    }

    const data = await res.json();
    const items = data.list || [];

    return items
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
      .filter((item): item is ProviderCandidate => item !== null);
  } catch (err) {
    console.error("[Dailymotion Provider] Search error:", err);
    return [];
  }
}
