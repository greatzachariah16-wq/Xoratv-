export type ProviderType = "youtube" | "vimeo" | "dailymotion";

export interface ProviderCandidate {
  id: string; // e.g. yt-<videoId>, vimeo-<id>, dm-<id>
  provider: ProviderType;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  embedUrl: string; // official embed URL
  watchUrl: string; // official page URL
  durationSeconds: number | null;
  channelName: string | null;
  publishedAt: string | null;
  tags?: string[];
}

export interface ProviderSearchParams {
  query: string;
  limit?: number;
  feed?: "home" | "shorts" | "learn";
}
