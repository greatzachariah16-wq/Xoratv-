import type { ProviderCandidate, ProviderSearchParams } from "./types";

function parseIsoDuration(durationStr: string): number | null {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export async function searchYouTube(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const apiKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_YOUTUBE_API_KEY) ||
    (typeof process !== "undefined" && process.env?.YOUTUBE_API_KEY) ||
    "";

  if (!apiKey || apiKey.trim() === "") {
    console.warn(
      "[YouTube Provider] VITE_YOUTUBE_API_KEY is not configured. Set VITE_YOUTUBE_API_KEY to search YouTube.",
    );
    return [];
  }

  const query = params.query.trim();
  if (!query) return [];
  const limit = Math.min(params.limit || 10, 25);

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[YouTube Provider] API HTTP ${res.status}: ${errBody}`);
      return [];
    }

    const data = await res.json();
    const items = data.items || [];
    if (!items.length) return [];

    // Gather video IDs to fetch duration details
    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter(Boolean) as string[];

    const durationMap: Record<string, number> = {};
    if (videoIds.length > 0) {
      try {
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(",")}&key=${encodeURIComponent(apiKey)}`;
        const detailsRes = await fetch(detailsUrl);
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          for (const item of detailsData.items || []) {
            const parsed = parseIsoDuration(item.contentDetails?.duration || "");
            if (parsed !== null) {
              durationMap[item.id] = parsed;
            }
          }
        }
      } catch (durationErr) {
        console.warn("[YouTube Provider] Failed to fetch durations:", durationErr);
      }
    }

    return items
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
          const thumbnail =
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            null;

          return {
            id: `yt-${videoId}`,
            provider: "youtube",
            title: snippet.title,
            description: snippet.description || null,
            thumbnailUrl: thumbnail,
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
            durationSeconds: durationMap[videoId] || null,
            channelName: snippet.channelTitle || null,
            publishedAt: snippet.publishedAt || null,
          };
        },
      );
  } catch (err) {
    console.error("[YouTube Provider] Search error:", err);
    return [];
  }
}
