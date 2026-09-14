import type { ProviderCandidate, ProviderSearchParams } from "./types";

export async function searchVimeo(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const token =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_VIMEO_ACCESS_TOKEN) ||
    (typeof process !== "undefined" && process.env?.VIMEO_ACCESS_TOKEN) ||
    "";

  if (!token || token.trim() === "") {
    console.warn(
      "[Vimeo Provider] VITE_VIMEO_ACCESS_TOKEN is not configured. Set VITE_VIMEO_ACCESS_TOKEN to search Vimeo.",
    );
    return [];
  }

  const query = params.query.trim();
  if (!query) return [];
  const limit = Math.min(params.limit || 10, 25);

  const searchUrl = `https://api.vimeo.com/videos?query=${encodeURIComponent(query)}&per_page=${limit}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[Vimeo Provider] API HTTP ${res.status}: ${errBody}`);
      return [];
    }

    const data = await res.json();
    const items = data.data || [];

    return items
      .map(
        (item: {
          uri: string;
          name: string;
          description?: string;
          link?: string;
          duration?: number;
          created_time?: string;
          release_time?: string;
          pictures?: {
            sizes?: Array<{ link: string; width: number }>;
            base_link?: string;
          };
          user?: { name?: string };
        }): ProviderCandidate | null => {
          // uri format: "/videos/123456789"
          const videoIdMatch = item.uri?.match(/\/videos\/(\d+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : null;
          if (!videoId) return null;

          const largestPic =
            item.pictures?.sizes && item.pictures.sizes.length > 0
              ? item.pictures.sizes[item.pictures.sizes.length - 1].link
              : item.pictures?.base_link || null;

          return {
            id: `vimeo-${videoId}`,
            provider: "vimeo",
            title: item.name || "Untitled Vimeo Video",
            description: item.description || null,
            thumbnailUrl: largestPic,
            embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
            watchUrl: item.link || `https://vimeo.com/${videoId}`,
            durationSeconds: typeof item.duration === "number" ? item.duration : null,
            channelName: item.user?.name || null,
            publishedAt: item.release_time || item.created_time || null,
          };
        },
      )
      .filter((item): item is ProviderCandidate => item !== null);
  } catch (err) {
    console.error("[Vimeo Provider] Search error:", err);
    return [];
  }
}
