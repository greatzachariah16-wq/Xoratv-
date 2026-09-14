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

export type PlaybackVerificationStatus =
  "playback_verified" | "playback_failed" | "blocked" | "requires_interaction" | "unknown";

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
  alternateSourceUrls?: string[] | undefined;
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

export type PriorityFlag =
  | "High (2026 Upcoming)"
  | "Standard (2018-2025)"
  | "Standard (Educational/Documentary)"
  | "Low (Uncategorized/Archive)";

export interface ScrapedContentMetrics {
  trailer_views?: number | null | undefined;
  social_buzz_score?: number | null | undefined;
  user_rating?: number | null | undefined;
  comment_volume?: number | null | undefined;
  like_count?: number | null | undefined;
}

export interface ScrapedMoviePayload {
  title: string;
  release_year?: number | null | undefined;
  genre: string[];
  content_type: ContentType | string;
  trailer_link?: string | null | undefined;
  description?: string | undefined;
  metrics: ScrapedContentMetrics;
  priority_flag: PriorityFlag;
  source_url?: string | undefined;
  source_name?: string | undefined;
  discovery_query?: string | undefined;
  discovery_timestamp?: string | undefined;
  raw_metadata?: Record<string, unknown> | undefined;
}

export interface CrawlCandidateResult {
  index: number;
  title: string;
  year: number | string;
  genre: string[];
  source: string;
  sourceUrl: string;
  alternateSources?: string[] | undefined;
  playbackStatus: PlaybackVerificationStatus;
  playbackUrl: string | null;
  posterUrl: string | null;
  description: string;
  contentType: ContentType | string;
  discoveryQuery: string;
  metrics: {
    views?: number | null;
    likes?: number | null;
    rating?: number | null;
    comments?: number | null;
  };
  diagnosisNote?: string;
}

export interface SourceBreakdown {
  source: string;
  totalCandidates: number;
  verifiedPlayback: number;
  blocked: number;
  requiresInteraction: number;
  playbackFailed: number;
  unknown: number;
  duplicates: number;
}

export interface SourceDiversityMetrics {
  candidatesPerSource: Record<string, number>;
  verifiedPlaybackPerSource: Record<string, number>;
  blockedPerSource: Record<string, number>;
  unknownPerSource: Record<string, number>;
  duplicatesPerSource: Record<string, number>;
  sourcesBreakdown: SourceBreakdown[];
  uniqueDomainsCount: number;
  uniqueDomainsList: string[];
  internetArchiveCount: number; // Strictly 0
  wikimediaCommonsCount: number; // Strictly 0
  nonInternetArchiveCount: number;
  modernCount2018_2026: number;
  olderCountPre2018: number; // Strictly 0 (1910-2017 forbidden)
  categoryBreakdown: {
    modernMovies: number;
    olderMovies: number;
    trailers: number;
    documentaries: number;
    educational: number;
    sports: number;
    interviews: number;
  };
}

export interface CrawlSummaryReport {
  totalDiscovered: number;
  totalPlaybackVerified: number;
  totalPlaybackFailed: number;
  totalBlocked: number;
  totalRequiresInteraction: number;
  totalUnknown: number;
  totalDuplicates: number;
  totalErrors: number;
  diversityMetrics: SourceDiversityMetrics;
  accountCreationDiagnosis: Record<string, unknown>;
  results: CrawlCandidateResult[];
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
