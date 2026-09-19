/**
 * 3. YouTube Discovery Component
 *
 * Discovers publicly accessible trailers, public domain / official ad-supported movies,
 * wrestling showcases, in-depth celebrity interviews, and educational video lectures on YouTube.
 */

import type { DiscoveredCandidate, QueryVariation, ContentType } from "./types.ts";
import { executeYouTubeApiSearch } from "../integrations/providers/youtube";

export interface YouTubeItemSummary {
  videoId: string;
  videoUrl: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl?: string | undefined;
}

export class YouTubeDiscovery {
  /**
   * Discovers candidate videos on YouTube using structured query variations.
   * Strictly verifies that release years belong to 2018..2026.
   * Forbids videos from 1910 to 2017.
   */
  public async discoverVideos(query: QueryVariation): Promise<DiscoveredCandidate[]> {
    const candidates: DiscoveredCandidate[] = [];

    // Primary: Official YouTube Data API v3 Search
    try {
      const apiRes = await executeYouTubeApiSearch({ query: query.query, limit: 8 });
      if (apiRes.ok && apiRes.candidates.length > 0) {
        for (const c of apiRes.candidates) {
          const year =
            this.extractYear(c.title, c.description || "", query.targetYearMin) ||
            (c.publishedAt ? new Date(c.publishedAt).getFullYear() : null);
          if (!year || year < 2018 || year > 2026) continue;
          const contentType = this.inferContentType(c.title, c.description || "", query.category);
          candidates.push({
            id: c.id,
            title: c.title,
            contentType,
            releaseYear: year,
            releaseStatus: year === 2026 ? "upcoming_2026" : "released",
            genres: this.inferGenres(c.title, c.description || "", query.category),
            tags: [query.category, "youtube", contentType],
            description: c.description || c.title,
            trailerUrl: c.watchUrl,
            sourceUrl: c.watchUrl,
            sourceName: "YouTube",
            discoveryQuery: query.query,
            discoveryCategory: query.category,
            discoveryTimestamp: new Date().toISOString(),
            signals: {
              viewCount: c.viewCount ?? undefined,
              collectedAt: new Date().toISOString(),
            },
          });
          if (candidates.length >= 4) break;
        }
        if (candidates.length > 0) {
          return candidates;
        }
      }
    } catch {
      // Fall through to scraping or fallback below
    }

    try {
      // Secondary: Web scraping fallback
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(7000),
      });

      if (res.ok) {
        const html = await res.text();
        const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
        if (match) {
          const data = JSON.parse(match[1]);
          const sections =
            data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
              ?.contents || [];

          for (const sec of sections) {
            const itemSection = sec.itemSectionRenderer?.contents || [];
            for (const item of itemSection) {
              if (item.videoRenderer) {
                const v = item.videoRenderer;
                const title = v.title?.runs?.[0]?.text;
                const videoId = v.videoId;
                if (!title || !videoId) continue;

                const snippet =
                  v.detailedMetadataSnippets?.[0]?.snippetText?.runs
                    ?.map((r: { text?: string }) => r.text || "")
                    .join("") || "";
                const publishedText = v.publishedTimeText?.simpleText || "";
                const viewCountText = v.viewCountText?.simpleText || "";

                // Year extraction and filtering: MUST BE 2018-2026
                const year = this.extractYear(title, publishedText, query.targetYearMin);
                if (!year || year < 2018 || year > 2026) {
                  // Forbid 1910-2017 and unverified years
                  continue;
                }

                const viewsMatch = viewCountText.replace(/[^0-9]/g, "");
                const views = viewsMatch ? parseInt(viewsMatch, 10) : undefined;
                const contentType = this.inferContentType(title, snippet, query.category);

                candidates.push({
                  id: `yt-${videoId}`,
                  title,
                  contentType,
                  releaseYear: year,
                  releaseStatus: year === 2026 ? "upcoming_2026" : "released",
                  genres: this.inferGenres(title, snippet, query.category),
                  tags: [query.category, "youtube", contentType],
                  description: snippet || title,
                  trailerUrl: `https://www.youtube.com/watch?v=${videoId}`,
                  sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
                  sourceName: "YouTube",
                  discoveryQuery: query.query,
                  discoveryCategory: query.category,
                  discoveryTimestamp: new Date().toISOString(),
                  signals: {
                    viewCount: views,
                    collectedAt: new Date().toISOString(),
                  },
                });

                if (candidates.length >= 4) break;
              }
            }
            if (candidates.length >= 4) break;
          }
        }
      }
    } catch {
      // Fallback below
    }

    // Fallback: DuckDuckGo search for YouTube links
    if (candidates.length === 0) {
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.query + " site:youtube.com")}`;
        const ddgRes = await fetch(ddgUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (ddgRes.ok) {
          const html = await ddgRes.text();
          const blocks = html.split('<div class="result results_links');
          for (const block of blocks.slice(1)) {
            const uMatch = block.match(/href="([^"]*uddg=([^"&]+)[^"]*)"/);
            const tMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
            const sMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
            if (uMatch && tMatch) {
              const realUrl = decodeURIComponent(uMatch[2]);
              const videoId = this.extractVideoId(realUrl);
              if (!videoId) continue;

              const title = tMatch[1].replace(/<[^>]+>/g, "").trim();
              const snippet = sMatch ? sMatch[1].replace(/<[^>]+>/g, "").trim() : "";
              const year = this.extractYear(title, snippet, query.targetYearMin);

              // Strict 2018-2026 filter
              if (!year || year < 2018 || year > 2026) continue;

              const contentType = this.inferContentType(title, snippet, query.category);

              candidates.push({
                id: `yt-${videoId}`,
                title,
                contentType,
                releaseYear: year,
                releaseStatus: year === 2026 ? "upcoming_2026" : "released",
                genres: this.inferGenres(title, snippet, query.category),
                tags: [query.category, "youtube", contentType],
                description: snippet || title,
                trailerUrl: `https://www.youtube.com/watch?v=${videoId}`,
                sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
                sourceName: "YouTube",
                discoveryQuery: query.query,
                discoveryCategory: query.category,
                discoveryTimestamp: new Date().toISOString(),
              });

              if (candidates.length >= 3) break;
            }
          }
        }
      } catch {
        // Safe fallback
      }
    }

    return candidates;
  }

  public extractYear(title: string, context = "", fallbackYear?: number): number | null {
    const text = `${title} ${context}`;
    const yearMatch = text.match(/\b(201[89]|202[0-6])\b/);
    if (yearMatch) {
      return parseInt(yearMatch[1], 10);
    }
    // If older years (1910-2017) are explicitly mentioned in title, reject immediately
    const olderYearMatch = text.match(/\b(19\d\d|200\d|201[0-7])\b/);
    if (olderYearMatch) {
      return parseInt(olderYearMatch[1], 10);
    }
    if (fallbackYear && fallbackYear >= 2018 && fallbackYear <= 2026) {
      return fallbackYear;
    }
    return null;
  }

  public inferContentType(title: string, description: string, category: string): ContentType {
    const text = `${title} ${description}`.toLowerCase();
    if (
      text.includes("trailer") ||
      text.includes("teaser") ||
      text.includes("first look") ||
      text.includes("preview") ||
      text.includes("announcement")
    ) {
      return "trailer";
    }
    if (category === "documentaries" || text.includes("documentary")) return "documentary";
    if (category === "celebrity_interviews" || text.includes("interview")) return "interview";
    if (
      category === "educational_content" ||
      text.includes("lecture") ||
      text.includes("explainer")
    )
      return "educational";
    if (category === "sports_wrestling" || text.includes("wrestling") || text.includes("match"))
      return "sports_wrestling";
    if (text.includes("full movie") || text.includes("feature film")) return "movie";
    return "other_video";
  }

  private inferGenres(title: string, description: string, category: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    const genres: string[] = [];
    if (text.includes("vampire") || text.includes("dracula")) genres.push("vampire", "horror");
    if (text.includes("zombie") || text.includes("undead")) genres.push("zombie", "horror");
    if (text.includes("werewolf") || text.includes("lycan")) genres.push("werewolf", "horror");
    if (text.includes("magic") || text.includes("sorcery") || text.includes("wizard"))
      genres.push("magic", "fantasy");
    if (text.includes("horror")) genres.push("horror");
    if (text.includes("thriller")) genres.push("thriller");
    if (text.includes("documentary")) genres.push("documentary");
    if (text.includes("wrestling")) genres.push("sports", "wrestling");
    if (text.includes("interview")) genres.push("interview");
    if (text.includes("educational") || text.includes("lecture")) genres.push("educational");

    if (genres.length === 0) {
      const cleanCat = category.replace(/_movies|_content/, "").replace("_", " ");
      genres.push(cleanCat);
    }
    return Array.from(new Set(genres));
  }

  /**
   * Extracts clean video IDs from various YouTube URL formats.
   */
  public extractVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtube.com")) {
        return parsed.searchParams.get("v");
      }
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.slice(1).split("/")[0] ?? null;
      }
    } catch {
      // Invalid URL format
    }
    return null;
  }
}
