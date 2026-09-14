import type { ProviderCandidate, ProviderSearchParams, ProviderType } from "./types";
import { searchYouTube } from "./youtube";
import { searchVimeo } from "./vimeo";
import { searchDailymotion } from "./dailymotion";
import { setPostRecord, setProfile, getProfile, pathSafe } from "@/integrations/firebase/rtdb";
import { ref, set, get, remove } from "firebase/database";
import { rtdb } from "@/integrations/firebase/config";
import type { FeedType, PostRecord } from "@/integrations/firebase/types";

export * from "./types";
export * from "./embed";
export { searchYouTube } from "./youtube";
export { searchVimeo } from "./vimeo";
export { searchDailymotion } from "./dailymotion";

export interface MultiProviderSearchParams extends ProviderSearchParams {
  providers?: ProviderType[];
}

/**
 * Searches across selected providers concurrently.
 */
export async function searchAllProviders(
  params: MultiProviderSearchParams,
): Promise<ProviderCandidate[]> {
  const selected = params.providers || ["youtube", "vimeo", "dailymotion"];
  const tasks: Promise<ProviderCandidate[]>[] = [];

  if (selected.includes("youtube")) {
    tasks.push(searchYouTube(params));
  }
  if (selected.includes("vimeo")) {
    tasks.push(searchVimeo(params));
  }
  if (selected.includes("dailymotion")) {
    tasks.push(searchDailymotion(params));
  }

  const results = await Promise.allSettled(tasks);
  const combined: ProviderCandidate[] = [];

  for (const res of results) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      combined.push(...res.value);
    }
  }

  return combined;
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
  targetFeed: FeedType = "home",
): Promise<PostRecord> {
  const authorId = candidate.channelName
    ? `channel-${pathSafe(candidate.channelName.toLowerCase())}`
    : `provider-${candidate.provider}`;

  // Ensure author profile exists
  try {
    const existingProfile = await getProfile(authorId);
    if (!existingProfile) {
      await setProfile({
        id: authorId,
        username: candidate.channelName
          ? candidate.channelName.replace(/\s+/g, "_").toLowerCase().slice(0, 24)
          : candidate.provider,
        display_name: candidate.channelName || `${candidate.provider.toUpperCase()} Creator`,
        avatar_url: candidate.thumbnailUrl || null,
        bio: `Discovered from ${candidate.provider}`,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[RealtimeDB] Profile setup note:", err);
  }

  const post: PostRecord = {
    id: candidate.id,
    author_id: authorId,
    title: candidate.title,
    caption: candidate.description,
    kind: "video",
    feed: targetFeed,
    status: "published",
    approval_status: "approved",
    media_path: null, // Provider-hosted; no Render/local file
    poster_path: candidate.thumbnailUrl,
    stream_url: candidate.embedUrl || candidate.watchUrl,
    duration_seconds: candidate.durationSeconds,
    featured: false,
    recommendation_score: 95,
    quality_score: 95,
    is_color: true,
    rights_status: "unknown",
    source: candidate.provider,
    created_at: candidate.publishedAt || new Date().toISOString(),
    discovered_at: new Date().toISOString(),
  };

  // Write to /posts and /postsByFeed
  await setPostRecord(post);

  // Remove from candidates queue once published
  await removeCrawlerCandidate(candidate.id).catch(() => {});

  return post;
}
