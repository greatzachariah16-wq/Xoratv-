/** Browser-safe types and helpers shared by the discovery engine and the UI. */

export type ContentSource = "creator" | "internet_archive" | "wikimedia_commons" | "nasa_svs";

export const SOURCE_LABEL: Record<ContentSource, string> = {
  creator: "Creator",
  internet_archive: "Internet Archive",
  wikimedia_commons: "Wikimedia Commons",
  nasa_svs: "NASA SVS",
};

export type ApprovalStatus = "approved" | "pending_review" | "rejected" | "hidden";

export type RightsStatus =
  "public_domain" | "cc0" | "cc_by" | "cc_by_sa" | "other_open" | "unknown" | "restricted";

export const OPEN_RIGHTS: RightsStatus[] = [
  "public_domain",
  "cc0",
  "cc_by",
  "cc_by_sa",
  "other_open",
];

export type ScoreWeights = {
  res1080: number;
  res720: number;
  res480: number;
  picture: number;
  audio: number;
  color: number;
  genre: number;
  interesting: number;
  metadata: number;
  duration: number;
  recency: number;
  duplicate: number;
  bw_penalty: number;
  quality_penalty: number;
  min_publish_score: number;
  min_review_score: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  res1080: 20,
  res720: 15,
  res480: 4,
  picture: 15,
  audio: 15,
  color: 10,
  genre: 10,
  interesting: 20,
  metadata: 5,
  duration: 5,
  recency: 5,
  duplicate: -100,
  bw_penalty: -25,
  quality_penalty: -30,
  min_publish_score: 55,
  min_review_score: 30,
};

/** Category weighting used by the interestingness engine. */
export const CATEGORY_PRIORITY: Record<string, number> = {
  horror: 1,
  vampire: 1,
  zombie: 1,
  "sci-fi": 1,
  mystery: 1,
  documentary: 0.8,
  space: 0.8,
  science: 0.8,
  history: 0.8,
  cartoons: 0.8,
  kids: 0.8,
  animation: 0.8,
  educational: 0.8,
  comedy: 0.6,
  adventure: 0.6,
  drama: 0.6,
  classic: 0.6,
  general: 0.4,
};

export type DiscoveryQueue =
  | "recommended"
  | "pending"
  | "approved"
  | "rejected"
  | "rights_uncertain"
  | "low_quality"
  | "black_and_white"
  | "new";
