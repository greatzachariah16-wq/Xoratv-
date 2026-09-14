/**
 * 6. Metadata Extraction & Quality Scoring Component
 *
 * Formats discovered candidates into the exact structured JSON payload required by the spec.
 * Collects secondary metrics (trailer views, social buzz score, user ratings, comments)
 * strictly in a PASSIVE manner without altering queue order or ranking.
 */

import type {
  ScrapedMoviePayload,
  ScrapedContentMetrics,
  PriorityFlag,
  DiscoveredCandidate,
} from "./types.ts";

export class MetadataScorer {
  /**
   * Computes a normalized social buzz score (0.0 to 10.0) from passive signals.
   * Passive collection: Does not re-order or filter items.
   */
  public computePassiveBuzzScore(
    views?: number | null,
    likes?: number | null,
    comments?: number | null,
  ): number | null {
    if (!views && !likes && !comments) return null;

    const safeViews = views ?? 0;
    const safeLikes = likes ?? 0;
    const safeComments = comments ?? 0;

    // Logarithmic engagement volume calculation
    const volumeScore = Math.min(6.0, Math.log10(Math.max(10, safeViews)) * 1.2);
    const interactionBonus = Math.min(
      4.0,
      (safeLikes * 3 + safeComments * 10) / Math.max(100, safeViews * 0.05),
    );

    const total = Math.min(10.0, volumeScore + interactionBonus);
    return parseFloat(total.toFixed(1));
  }

  /**
   * Assigns priority flag strictly adhering to 2018-2026 rules:
   * "High (2026 Upcoming)" for 2026 upcoming or trailers
   */
  public determinePriorityFlag(
    releaseYear?: number | null,
    releaseStatus?: string,
    isUpcomingOrTrailer?: boolean,
  ): PriorityFlag {
    if (
      releaseYear === 2026 ||
      releaseStatus === "upcoming_2026" ||
      releaseStatus === "announced_2026" ||
      isUpcomingOrTrailer
    ) {
      return "High (2026 Upcoming)";
    }
    if (releaseYear && releaseYear >= 2018 && releaseYear <= 2025) {
      return "Standard (2018-2025)";
    }
    return "Standard (Educational/Documentary)";
  }

  /**
   * Generates the canonical JSON payload defined in Section 6 of the Technical Specification:
   *
   * {
   *   "title": "Example Zombie Thriller 2026",
   *   "release_year": 2026,
   *   "genre": ["zombie", "horror"],
   *   "content_type": "movie",
   *   "trailer_link": "https://youtube.com/watch?v=example",
   *   "description": "An upcoming survival feature set in...",
   *   "metrics": {
   *     "trailer_views": 145000,
   *     "social_buzz_score": 8.4,
   *     "user_rating": null
   *   },
   *   "priority_flag": "High (2026 Upcoming)"
   * }
   */
  public buildScrapedPayload(params: {
    title: string;
    releaseYear?: number | null;
    genres: string[];
    contentType: string;
    trailerLink?: string | null;
    description?: string;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    userRating?: number | null;
    releaseStatus?: string;
    sourceUrl?: string;
    sourceName?: string;
    discoveryQuery?: string;
  }): ScrapedMoviePayload {
    const isUpcomingOrTrailer =
      params.contentType === "trailer" ||
      params.title.toLowerCase().includes("upcoming") ||
      params.title.toLowerCase().includes("trailer");

    const buzzScore = this.computePassiveBuzzScore(params.views, params.likes, params.comments);
    const priorityFlag = this.determinePriorityFlag(
      params.releaseYear,
      params.releaseStatus,
      isUpcomingOrTrailer,
    );

    const metrics: ScrapedContentMetrics = {
      trailer_views: params.views ?? null,
      social_buzz_score: buzzScore,
      user_rating: params.userRating ?? null,
      comment_volume: params.comments ?? null,
      like_count: params.likes ?? null,
    };

    return {
      title: params.title,
      release_year: params.releaseYear ?? null,
      genre: params.genres,
      content_type: params.contentType,
      trailer_link: params.trailerLink ?? null,
      description: params.description ?? "",
      metrics,
      priority_flag: priorityFlag,
      source_url: params.sourceUrl,
      source_name: params.sourceName,
      discovery_query: params.discoveryQuery,
      discovery_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Converts a DiscoveredCandidate to the standardized ScrapedMoviePayload
   */
  public candidateToPayload(candidate: DiscoveredCandidate): ScrapedMoviePayload {
    return this.buildScrapedPayload({
      title: candidate.title,
      releaseYear: candidate.releaseYear ?? null,
      genres:
        candidate.genres.length > 0
          ? candidate.genres
          : [candidate.discoveryCategory.replace(/_/g, " ")],
      contentType: candidate.contentType,
      trailerLink: candidate.trailerUrl ?? null,
      description: candidate.description,
      views: candidate.signals?.viewCount ?? candidate.engagementInfo?.views ?? null,
      likes: candidate.signals?.likeCount ?? candidate.engagementInfo?.likes ?? null,
      comments: candidate.signals?.commentCount ?? candidate.engagementInfo?.comments ?? null,
      userRating: candidate.signals?.ratingScore ?? candidate.ratingInfo?.score ?? null,
      releaseStatus: candidate.releaseStatus,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.sourceName,
      discoveryQuery: candidate.discoveryQuery,
    });
  }
}
