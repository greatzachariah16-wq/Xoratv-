export type ProviderType = "youtube" | "vimeo" | "noaa";

export interface ProviderCandidate {
  id: string; // e.g. yt-<videoId>, vimeo-<id>, noaa-<id>
  provider: ProviderType;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  embedUrl: string; // official embed or direct playback URL
  watchUrl: string; // official source page URL
  durationSeconds: number | null;
  channelName: string | null;
  publishedAt: string | null;
  tags?: string[];
  viewCount?: number | null;
  resolution?: string | null;
  isVertical?: boolean | null;
  expedition?: string | null;
  dive?: string | null;
  credit?: string | null;
}

export interface ProviderSearchParams {
  query: string;
  limit?: number;
  feed?: "home" | "shorts" | "learn";
  minDurationSeconds?: number;
  order?: "date" | "relevance";
}

export interface ProviderExecutionStatus {
  provider: ProviderType;
  ok: boolean;
  count: number;
  error?: string;
}

export interface MultiProviderSearchResult {
  candidates: ProviderCandidate[];
  statuses: ProviderExecutionStatus[];
}