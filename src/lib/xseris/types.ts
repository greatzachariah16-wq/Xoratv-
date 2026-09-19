export const XSERIS_CATEGORIES = [
  "Drama",
  "Action",
  "Documentary",
  "Romance",
  "Horror",
  "Thriller",
  "Sci-Fi",
  "Mystery",
  "Crime",
  "Adventure",
  "Fantasy",
  "Supernatural",
  "Kids",
  "Animation",
  "Comedy",
  "Other",
] as const;
export type XserisCategory = (typeof XSERIS_CATEGORIES)[number];
export type XserisStatus = "pending_review" | "approved" | "rejected" | "failed";
export type XserisProcessingStatus =
  "processing" | "metadata_found" | "ready_for_review" | "published" | "failed" | "duplicate";
export interface XserisMediaItem {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  source_provider: string;
  source_url: string;
  source_id: string | null;
  duration: number | null;
  release_year: number | null;
  language: string | null;
  status: XserisStatus;
  categories: XserisCategory[];
  created_at: string;
  updated_at: string;
  last_checked: string;
  discovery_status: "manual" | "candidate" | "processed" | "failed";
  discovered_from: string | null;
  parent_source_id: string | null;
  playback: { type: "embed" | "external"; url: string; provider: string } | null;
}
export interface XserisCandidate extends XserisMediaItem {
  processing_status: XserisProcessingStatus;
  error: string | null;
}
