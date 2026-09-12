/**
 * Core type definitions for the Xora Open Web Crawler.
 *
 * This crawler architecture is completely isolated from the legacy discovery system
 * and operates independently to discover publicly accessible movies and educational content.
 */

export type CrawlerCategory =
  | "vampire_movies"
  | "zombie_movies"
  | "werewolf_movies"
  | "magic_themed_movies"
  | "documentaries"
  | "sports_wrestling"
  | "celebrity_interviews"
  | "educational_content"
  | "other_movies"
  | "other_videos";

export type ContentType =
  | "movie"
  | "documentary"
  | "educational"
  | "sports_wrestling"
  | "interview"
  | "trailer"
  | "short_clip"
  | "other_video";

export type ReleaseStatus =
  "released" | "upcoming_2026" | "announced_2026" | "announced" | "in_production" | "unknown";

export interface QualityInterestSignals {
  viewCount?: number | undefined;
  likeCount?: number | undefined;
  commentCount?: number | undefined;
  ratingScore?: number | undefined;
  ratingScale?: string | undefined; // e.g. "10", "100", "5"
  reviewCount?: number | undefined;
  subscriberFollowerCount?: number | undefined;
  engagementRatio?: number | undefined;
  collectedAt: string;
}

export interface RatingInfo {
  score: number;
  scale: string;
  source: string;
  voteCount?: number | undefined;
}

export interface EngagementInfo {
  views?: number | undefined;
  likes?: number | undefined;
  comments?: number | undefined;
  creatorOrChannel?: string | undefined;
}

export interface DiscoveredCandidate {
  id: string;
  title: string;
  contentType: ContentType;
  releaseYear?: number | undefined;
  releaseDate?: string | undefined;
  releaseStatus: ReleaseStatus;
  genres: string[];
  tags: string[];
  description?: string | undefined;
  trailerUrl?: string | undefined;
  sourceUrl: string;
  sourceName: string;
  discoveryQuery: string;
  discoveryCategory: CrawlerCategory;
  ratingInfo?: RatingInfo | undefined;
  engagementInfo?: EngagementInfo | undefined;
  signals?: QualityInterestSignals | undefined;
  discoveryTimestamp: string;
  rawMetadata?: Record<string, unknown> | undefined;
}

export interface QueryVariation {
  id: string;
  category: CrawlerCategory;
  query: string;
  intent:
    | "upcoming_2026"
    | "trailers_2026"
    | "releases_2018_2026"
    | "educational_archive"
    | "full_movie"
    | "general_discovery";
  targetPlatform: "web" | "youtube" | "all";
  targetYearMin?: number | undefined;
  targetYearMax?: number | undefined;
  priorityWeight?: number | undefined;
}

export interface CrawlerRunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string | undefined;
  status: "idle" | "running" | "completed" | "failed";
  queriesExecuted: number;
  candidatesFound: number;
  candidatesStored: number;
  categoriesCovered: CrawlerCategory[];
  errors: string[];
}
