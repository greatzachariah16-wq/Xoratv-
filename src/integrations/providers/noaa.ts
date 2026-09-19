import type { ProviderCandidate, ProviderSearchParams } from "./types";

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#215;/g, "×")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ParentMetadata {
  title: string;
  excerpt: string;
  credit: string;
  posterUrl: string | null;
}

const parentCache = new Map<number, ParentMetadata>();

async function getParentMetadata(postId: number): Promise<ParentMetadata | null> {
  if (parentCache.has(postId)) {
    return parentCache.get(postId)!;
  }

  try {
    const parentRes = await fetch(
      `https://oceanexplorer.noaa.gov/wp-json/wp/v2/multimedia/${postId}?_embed=1`,
      {
        headers: { Accept: "application/json" },
      },
    );

    if (parentRes.ok) {
      const parent = await parentRes.json();
      const title = decodeHtmlEntities(parent.title?.rendered || "");
      const excerpt = decodeHtmlEntities(parent.excerpt?.rendered || "");
      const credit = parent.acf?.credit
        ? decodeHtmlEntities(parent.acf.credit)
        : "NOAA Ocean Exploration";
      const posterUrl =
        parent._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
        parent.yoast_head_json?.og_image?.[0]?.url ||
        null;

      const meta: ParentMetadata = { title, excerpt, credit, posterUrl };
      parentCache.set(postId, meta);

      if (parentCache.size > 100) {
        const firstKey = parentCache.keys().next().value;
        if (firstKey !== undefined) parentCache.delete(firstKey);
      }

      return meta;
    }
  } catch {
    // Non-blocking parent fetch fallback
  }

  return null;
}

/**
 * Searches the official NOAA Ocean Exploration media repository.
 * No API key required for public access.
 */
export async function searchNoaaWithStatus(params: ProviderSearchParams): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  const query = params.query.trim();
  const limit = Math.min(params.limit || 10, 20);

  // Default deep-sea exploration query if empty
  const searchQuery = query || "deep sea";

  const searchUrl = `https://oceanexplorer.noaa.gov/wp-json/wp/v2/media?mime_type=video/mp4&search=${encodeURIComponent(searchQuery)}&per_page=${limit}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "XoraTV-Discovery/1.0 (Deep-Sea Media Connector)",
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        count: 0,
        candidates: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const mediaItems = (await res.json()) as Array<{
      id: number;
      date: string;
      source_url: string;
      title?: { rendered?: string };
      caption?: { rendered?: string };
      description?: { rendered?: string };
      post?: number;
      media_details?: {
        width?: number;
        height?: number;
        length?: number;
        length_formatted?: string;
        filesize?: number;
      };
    }>;

    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
      return { ok: true, count: 0, candidates: [] };
    }

    // Pre-fetch up to 5 unique parent posts in parallel using cache
    const uniquePostIds = Array.from(
      new Set(mediaItems.map((i) => i.post).filter((p): p is number => Boolean(p))),
    ).slice(0, 5);

    await Promise.all(uniquePostIds.map((pid) => getParentMetadata(pid)));

    const candidates: ProviderCandidate[] = [];
    const seenTitles = new Set<string>();

    for (const item of mediaItems) {
      if (!item.source_url || !item.source_url.startsWith("http")) continue;

      const parentMeta = item.post ? (parentCache.get(item.post) ?? null) : null;
      const parentTitle = parentMeta?.title || "";
      const parentExcerpt = parentMeta?.excerpt || "";
      const parentCredit = parentMeta?.credit || "NOAA Ocean Exploration";
      const posterUrl = parentMeta?.posterUrl || null;
      let expeditionName: string | null = null;
      let diveName: string | null = null;

      const rawTitle =
        parentTitle ||
        decodeHtmlEntities(item.title?.rendered || "NOAA Deep-Sea Exploration Footage");
      const normalizedTitleKey = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Deduplicate multiple resolution variants of identical dive/subject
      if (seenTitles.has(normalizedTitleKey) && normalizedTitleKey.length > 5) {
        continue;
      }
      seenTitles.add(normalizedTitleKey);

      // Extract Dive / Expedition details
      const diveMatch = (rawTitle + " " + item.source_url).match(/dive\s*0?(\d+)/i);
      if (diveMatch) {
        diveName = `Dive ${diveMatch[1]}`;
      }

      const expMatch = (rawTitle + " " + parentCredit).match(/(\d{4}\s+[^,]+Exploration|EX\d{4})/i);
      if (expMatch) {
        expeditionName = expMatch[1].trim();
      }

      const rawCaption =
        parentExcerpt ||
        decodeHtmlEntities(item.caption?.rendered || "") ||
        decodeHtmlEntities(item.description?.rendered || "");

      const cleanDesc =
        rawCaption && !rawCaption.startsWith("http")
          ? rawCaption
          : `Official deep-sea exploration footage recorded by NOAA Ocean Exploration. ${parentCredit ? `Credit: ${parentCredit}` : ""}`;

      const height = item.media_details?.height;
      const width = item.media_details?.width;
      const resolution = height ? `${height}p` : width && width >= 1920 ? "1080p" : "HD";

      candidates.push({
        id: `noaa-${item.id}`,
        provider: "noaa",
        title: rawTitle,
        description: cleanDesc,
        thumbnailUrl: posterUrl,
        embedUrl: item.source_url, // Direct MP4 video stream supported by NativeVideoPlayer
        watchUrl: `https://oceanexplorer.noaa.gov/video/`,
        durationSeconds: item.media_details?.length || null,
        channelName: "NOAA Ocean Exploration",
        publishedAt: item.date || new Date().toISOString(),
        tags: ["deep sea", "ocean exploration", "marine life", "rov", "underwater", "noaa"],
        resolution,
        expedition: expeditionName,
        dive: diveName,
        credit: parentCredit,
      });
    }

    return { ok: true, count: candidates.length, candidates };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, count: 0, candidates: [], error: msg };
  }
}

export async function searchNoaa(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const res = await searchNoaaWithStatus(params);
  return res.candidates;
}
