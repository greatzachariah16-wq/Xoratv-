/**
 * 5. YouTube Targeted Ingestion Pipeline
 *
 * Implements an API-first targeted ingestion pipeline backed by headless fallback.
 * Queries for keywords matching `[Genre] trailer 2026` or `celebrity interview documentary`.
 * Extracts: title, publishedAt (filtered for 2018-2026), description, viewCount, and trailer link.
 */

import type { ScrapedMoviePayload, ScrapedContentMetrics } from "./types.ts";

export interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
    thumbnails?: { high?: { url: string } };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

export class YouTubeIngestionPipeline {
  /**
   * Generates targeted search queries for the YouTube pipeline across:
   * trailers, documentaries, celebrity interviews, educational videos,
   * sports/wrestling, movie announcements, and 2026 movie news.
   */
  public getTargetedQueries(): string[] {
    const genres = ["vampire", "zombie", "werewolf", "magic fantasy", "horror", "thriller"];

    const queries: string[] = [];

    // 1. 2026 Trailers & Announcements
    for (const g of genres) {
      queries.push(`${g} official trailer 2026`);
      queries.push(`${g} movie teaser trailer 2026`);
      queries.push(`${g} movie announcement 2026`);
    }

    // 2. 2026 Movie News & Announcements
    queries.push("upcoming 2026 movie trailers");
    queries.push("2026 movie news announcement");
    queries.push("newly released 2026 movies trailer");

    // 3. Documentaries, Interviews, Educational, Sports (2018-2026)
    queries.push("investigative documentary 2024 full");
    queries.push("nature science documentary 2024");
    queries.push("celebrity in-depth interview 2024");
    queries.push("actor director interview 2025");
    queries.push("computer science educational lecture 2024");
    queries.push("science educational explainer 2024");
    queries.push("sports wrestling championship match 2024");
    queries.push("professional wrestling highlights 2024");

    return queries;
  }

  /**
   * Transforms raw YouTube video data into the normalized ScrapedMoviePayload.
   * Strictly filters published date to 2018..2026. Older videos (1910-2017) are strictly forbidden.
   */
  public transformYouTubeVideo(item: YouTubeSearchItem, query: string): ScrapedMoviePayload | null {
    const publishedAt = item.snippet.publishedAt;
    const yearMatch = publishedAt ? publishedAt.substring(0, 4) : "";
    let releaseYear = yearMatch ? parseInt(yearMatch, 10) : undefined;

    // Check title for year if published year is missing
    if (!releaseYear) {
      const titleYearMatch = item.snippet.title.match(/\b(201[89]|202[0-6])\b/);
      if (titleYearMatch) {
        releaseYear = parseInt(titleYearMatch[1], 10);
      }
    }

    // Strict temporal filter: 2018 to 2026. Forbid 1910 to 2017!
    if (!releaseYear || releaseYear < 2018 || releaseYear > 2026) {
      return null;
    }

    const videoId = item.id.videoId;
    const trailerLink = `https://youtube.com/watch?v=${videoId}`;
    const views = item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : null;
    const likes = item.statistics?.likeCount ? parseInt(item.statistics.likeCount, 10) : null;
    const comments = item.statistics?.commentCount
      ? parseInt(item.statistics.commentCount, 10)
      : null;

    const isUpcoming2026 =
      releaseYear === 2026 ||
      item.snippet.title.toLowerCase().includes("2026") ||
      item.snippet.title.toLowerCase().includes("trailer");

    const contentType = this.inferContentType(item.snippet.title, item.snippet.description);

    const metrics: ScrapedContentMetrics = {
      trailer_views: views,
      social_buzz_score: views
        ? parseFloat((Math.log10(Math.max(10, views)) * 1.5).toFixed(1))
        : null,
      user_rating: null,
      comment_volume: comments,
      like_count: likes,
    };

    return {
      title: item.snippet.title,
      release_year: releaseYear,
      genre: this.inferGenres(item.snippet.title, item.snippet.description),
      content_type: contentType,
      trailer_link: trailerLink,
      description: item.snippet.description,
      metrics,
      priority_flag: isUpcoming2026 ? "High (2026 Upcoming)" : "Standard (2018-2025)",
      source_url: trailerLink,
      source_name: "YouTube",
      discovery_query: query,
      discovery_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Distinguishes trailers from full movies, documentaries, interviews, educational, etc.
   * A trailer must be classified as a trailer/video, NOT automatically as a full movie.
   */
  public inferContentType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    if (
      text.includes("trailer") ||
      text.includes("teaser") ||
      text.includes("first look") ||
      text.includes("promo") ||
      text.includes("sneak peek") ||
      text.includes("announcement")
    ) {
      return "trailer";
    }
    if (text.includes("documentary") || text.includes("docuseries")) return "documentary";
    if (
      text.includes("interview") ||
      text.includes("in conversation") ||
      text.includes("roundtable")
    )
      return "interview";
    if (
      text.includes("lecture") ||
      text.includes("course") ||
      text.includes("educational") ||
      text.includes("tutorial") ||
      text.includes("explainer")
    ) {
      return "educational";
    }
    if (
      text.includes("wrestling") ||
      text.includes("wwe") ||
      text.includes("aew") ||
      text.includes("match")
    )
      return "sports_wrestling";
    if (text.includes("news") || text.includes("report") || text.includes("breakdown"))
      return "other_video";
    if (text.includes("full movie") || text.includes("feature film")) return "movie";
    return "other_video";
  }

  private inferGenres(title: string, description: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    const genres: string[] = [];
    if (text.includes("vampire") || text.includes("dracula")) genres.push("vampire", "horror");
    if (text.includes("zombie") || text.includes("undead")) genres.push("zombie", "horror");
    if (text.includes("werewolf") || text.includes("lycan")) genres.push("werewolf", "horror");
    if (text.includes("magic") || text.includes("wizard") || text.includes("sorcery"))
      genres.push("magic", "fantasy");
    if (text.includes("documentary")) genres.push("documentary");
    if (text.includes("wrestling")) genres.push("sports", "wrestling");
    if (text.includes("interview")) genres.push("interview");
    if (text.includes("lecture") || text.includes("educational")) genres.push("educational");
    return genres.length > 0 ? Array.from(new Set(genres)) : ["general"];
  }
}
