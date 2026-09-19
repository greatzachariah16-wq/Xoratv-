import type {
  ProviderCandidate,
  ProviderSearchParams,
  ProviderType,
  ProviderExecutionStatus,
  MultiProviderSearchResult,
} from "./types";
import { searchYouTubeWithStatus } from "./youtube";
import { searchVimeoWithStatus } from "./vimeo";
import { searchDailymotionWithStatus } from "./dailymotion";
import { searchNoaaWithStatus } from "./noaa";
import { setPostRecord, setProfile, getProfile, pathSafe } from "@/integrations/firebase/rtdb";
import { ref, set, get, remove } from "firebase/database";
import { rtdb } from "@/integrations/firebase/config";
import type { FeedType, PostRecord } from "@/integrations/firebase/types";

export * from "./types";
export * from "./embed";
export { searchYouTube, searchYouTubeWithStatus } from "./youtube";
export { searchVimeo, searchVimeoWithStatus } from "./vimeo";
export { searchDailymotion, searchDailymotionWithStatus } from "./dailymotion";
export { searchNoaa, searchNoaaWithStatus } from "./noaa";

export interface MultiProviderSearchParams extends ProviderSearchParams {
  providers?: ProviderType[];
  autoPublishTrusted?: boolean;
}

/**
 * Searches across selected providers concurrently and returns granular status per provider.
 */
export async function searchAllProvidersWithStatus(
  params: MultiProviderSearchParams,
): Promise<MultiProviderSearchResult> {
  const selected = params.providers || ["noaa", "youtube", "vimeo", "dailymotion"];
  const statuses: ProviderExecutionStatus[] = [];
  const candidates: ProviderCandidate[] = [];

  const tasks: Array<Promise<void>> = [];

  if (selected.includes("noaa")) {
    tasks.push(
      searchNoaaWithStatus(params).then((res) => {
        statuses.push({
          provider: "noaa",
          ok: res.ok,
          count: res.count,
          error: res.error,
        });
        if (res.candidates.length) {
          candidates.push(...res.candidates);
        }
      }),
    );
  }

  if (selected.includes("youtube")) {
    tasks.push(
      searchYouTubeWithStatus(params).then((res) => {
        statuses.push({
          provider: "youtube",
          ok: res.ok,
          count: res.count,
          error: res.error,
        });
        if (res.candidates.length) {
          candidates.push(...res.candidates);
        }
      }),
    );
  }

  if (selected.includes("vimeo")) {
    tasks.push(
      searchVimeoWithStatus(params).then((res) => {
        statuses.push({
          provider: "vimeo",
          ok: res.ok,
          count: res.count,
          error: res.error,
        });
        if (res.candidates.length) {
          candidates.push(...res.candidates);
        }
      }),
    );
  }

  if (selected.includes("dailymotion")) {
    tasks.push(
      searchDailymotionWithStatus(params).then((res) => {
        statuses.push({
          provider: "dailymotion",
          ok: res.ok,
          count: res.count,
          error: res.error,
        });
        if (res.candidates.length) {
          candidates.push(...res.candidates);
        }
      }),
    );
  }

  await Promise.allSettled(tasks);

  const minDuration =
    typeof params.minDurationSeconds === "number"
      ? params.minDurationSeconds
      : params.feed === "shorts"
        ? 0
        : DURATION_HOME_THRESHOLD_SECONDS; // 2400 seconds = 40 minutes

  const filteredCandidates = candidates.filter((c) => {
    if (
      minDuration > 0 &&
      typeof c.durationSeconds === "number" &&
      c.durationSeconds < minDuration
    ) {
      return false;
    }
    return true;
  });

  // Auto-publish trusted sources (like NOAA/YouTube/Vimeo) or when requested
  if (params.autoPublishTrusted) {
    await autoPublishHighConfidenceCandidates(filteredCandidates, {
      targetFeed: params.feed,
    });
  }

  return { candidates: filteredCandidates, statuses };
}

/**
 * Duration threshold in seconds for video routing (40 minutes = 2400 seconds).
 * Videos >= 2400 seconds go to the 'home' feed.
 * Videos < 2400 seconds go to the 'shorts' feed.
 */
export const DURATION_HOME_THRESHOLD_SECONDS = 2400;

/**
 * Resolves target feed based on video duration:
 * - >= 40 minutes (2400s) -> 'home' feed
 * - < 40 minutes -> 'shorts' feed
 * Allows an optional explicit override (e.g. admin selection).
 */
export function resolveFeedByDuration(
  durationSeconds?: number | null,
  overrideFeed?: FeedType | null,
): FeedType {
  if (overrideFeed) return overrideFeed;
  if (typeof durationSeconds === "number" && durationSeconds >= DURATION_HOME_THRESHOLD_SECONDS) {
    return "home";
  }
  return "shorts";
}

/**
 * Searches across selected providers concurrently.
 */
export async function searchAllProviders(
  params: MultiProviderSearchParams,
): Promise<ProviderCandidate[]> {
  const result = await searchAllProvidersWithStatus(params);
  return result.candidates;
}

/**
 * Automatically publishes high-confidence candidates (e.g. NOAA public domain videos or verified items)
 * directly to RTDB feeds so ranking and feeds receive live content automatically.
 */
export async function autoPublishHighConfidenceCandidates(
  candidates: ProviderCandidate[],
  options?: { targetFeed?: FeedType; trustedOnly?: boolean },
): Promise<PostRecord[]> {
  const published: PostRecord[] = [];
  const trustedOnly = options?.trustedOnly ?? true;

  for (const candidate of candidates) {
    // Auto-publish NOAA, YouTube, or when trustedOnly is disabled
    const isTrusted =
      candidate.provider === "noaa" || candidate.provider === "youtube" || !trustedOnly;
    if (isTrusted) {
      try {
        const feed = resolveFeedByDuration(candidate.durationSeconds, options?.targetFeed);
        const post = await publishCandidate(candidate, feed);
        published.push(post);
      } catch (err) {
        console.warn(`[Auto-Publish] Failed to auto-publish ${candidate.id}:`, err);
      }
    }
  }

  return published;
}

/**
 * Save candidate metadata to RTDB under `/crawler/candidates/<id>`
 */
export async function saveCandidateToRtdb(candidate: ProviderCandidate): Promise<void> {
  const safeId = pathSafe(candidate.id);
  const candidateRef = ref(rtdb, `crawler/candidates/${safeId}`);
  await set(candidateRef, {
    ...candidate,
    saved_at: new Date().toISOString(),
  });
}

/**
 * Batch save candidates to RTDB
 */
export async function saveCandidatesBatchToRtdb(candidates: ProviderCandidate[]): Promise<void> {
  await Promise.all(candidates.map((c) => saveCandidateToRtdb(c).catch(() => {})));
}

/**
 * Fetch all candidates currently stored in `/crawler/candidates`
 */
export async function getCrawlerCandidatesFromRtdb(): Promise<ProviderCandidate[]> {
  try {
    const snap = await get(ref(rtdb, "crawler/candidates"));
    if (!snap.exists()) return [];
    const val = snap.val();
    if (val && typeof val === "object") {
      return Object.values(val) as ProviderCandidate[];
    }
    return [];
  } catch (err) {
    console.warn("[RealtimeDB] Failed to fetch candidates:", err);
    return [];
  }
}

/**
 * Remove candidate from `/crawler/candidates`
 */
export async function removeCrawlerCandidate(candidateId: string): Promise<void> {
  try {
    await remove(ref(rtdb, `crawler/candidates/${pathSafe(candidateId)}`));
  } catch (err) {
    console.warn("[RealtimeDB] Failed to remove candidate:", err);
  }
}

/**
 * Publishes a provider candidate to the public feed:
 * 1. Writes to /posts/<postId>
 * 2. Writes to /postsByFeed/<feed>/<postId>
 * 3. Creates/updates provider author profile
 * 4. Cleans candidate from /crawler/candidates
 */
export async function publishCandidate(
  candidate: ProviderCandidate,
  targetFeed?: FeedType,
): Promise<PostRecord> {
  const feed = resolveFeedByDuration(candidate.durationSeconds, targetFeed);

  let authorId = candidate.channelName
    ? `channel-${pathSafe(candidate.channelName.toLowerCase())}`
    : `provider-${candidate.provider}`;
  let displayName = candidate.channelName || `${candidate.provider.toUpperCase()} Creator`;
  let bio = `Discovered from ${candidate.provider}`;
  let avatarUrl = candidate.thumbnailUrl || null;

  if (candidate.provider === "noaa") {
    authorId = "creator-noaa-ocean-exploration";
    displayName = "NOAA Ocean Exploration";
    bio = "Official deep-sea expeditions, ROV footage, and marine science from NOAA.";
    avatarUrl = "https://oceanexplorer.noaa.gov/wp-content/uploads/2025/04/logo-noaa.svg";
  }

  // Ensure author profile exists
  try {
    const existingProfile = await getProfile(authorId);
    if (!existingProfile) {
      await setProfile({
        id: authorId,
        username:
          candidate.provider === "noaa"
            ? "noaa_ocean"
            : candidate.channelName
              ? candidate.channelName.replace(/\s+/g, "_").toLowerCase().slice(0, 24)
              : candidate.provider,
        display_name: displayName,
        avatar_url: avatarUrl,
        bio: bio,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[RealtimeDB] Profile setup note:", err);
  }

  let genre = "General";
  if (candidate.provider === "noaa") {
    genre = "Nature";
  } else if (candidate.tags && candidate.tags.length > 0) {
    const rawTag = candidate.tags[0];
    genre = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
  } else {
    const titleLower = (candidate.title || "").toLowerCase();
    if (titleLower.includes("doc") || titleLower.includes("story")) genre = "Documentary";
    else if (
      titleLower.includes("ocean") ||
      titleLower.includes("nature") ||
      titleLower.includes("sea")
    )
      genre = "Nature";
    else if (titleLower.includes("space") || titleLower.includes("science")) genre = "Science";
    else if (titleLower.includes("wrestling") || titleLower.includes("match")) genre = "Sports";
  }

  const post: PostRecord = {
    id: candidate.id,
    author_id: authorId,
    title: candidate.title || "Untitled Video",
    caption: candidate.description || "",
    kind: "video",
    feed,
    status: "published",
    approval_status: "approved",
    media_path: null, // Provider/direct stream hosted
    poster_path: candidate.thumbnailUrl || null,
    stream_url: candidate.embedUrl || candidate.watchUrl,
    duration_seconds: candidate.durationSeconds || null,
    featured: false,
    recommendation_score: 95,
    quality_score: 95,
    is_color: true,
    rights_status: candidate.provider === "noaa" ? "public_domain" : "unknown",
    source: candidate.provider,
    created_at: candidate.publishedAt || new Date().toISOString(),
    discovered_at: new Date().toISOString(),
    genre,
  };

  // Write to /posts and /postsByFeed
  await setPostRecord(post);

  // Remove from candidates queue once published
  await removeCrawlerCandidate(candidate.id).catch(() => {});

  return post;
}
