import { isFirebaseConfigured } from "@/integrations/firebase/config";
import {
  appendUserEventRtdb,
  getUserSignalsRtdb,
  updateUserSignalsRtdb,
} from "@/integrations/firebase/rtdb";
import type {
  EventType,
  FeedType,
  UserEventRecord,
  UserSignals,
} from "@/integrations/firebase/types";

// Suggested increment weights for user affinity calculation
export const EVENT_AFFINITY_WEIGHTS: Record<EventType, number> = {
  view_complete: 3,
  like: 5,
  comment: 4,
  share: 4,
  follow: 6,
  view_3s: 1,
  skip: -1,
  not_interested: -8,
  hide: -8,
  view_start: 0,
  open_video: 1,
  click_profile: 2,
};

// Session memory cache for guest or instant local updates
const sessionSignals: UserSignals = {
  genres: {},
  authors: {},
  hiddenPostIds: {},
  hiddenAuthorIds: {},
};

// Load any session hidden items on client
if (typeof window !== "undefined") {
  try {
    const cached = sessionStorage.getItem("xora_session_signals");
    if (cached) {
      const parsed = JSON.parse(cached) as UserSignals;
      if (parsed.hiddenPostIds) sessionSignals.hiddenPostIds = parsed.hiddenPostIds;
      if (parsed.hiddenAuthorIds) sessionSignals.hiddenAuthorIds = parsed.hiddenAuthorIds;
      if (parsed.genres) sessionSignals.genres = parsed.genres;
      if (parsed.authors) sessionSignals.authors = parsed.authors;
    }
  } catch {
    // Ignore storage parse issues
  }
}

function persistSessionSignals() {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("xora_session_signals", JSON.stringify(sessionSignals));
    } catch {
      // Ignore quota issues
    }
  }
}

export function getSessionSignals(): UserSignals {
  return sessionSignals;
}

export type TrackEventParams = {
  type: EventType;
  postId?: string | null;
  authorId?: string | null;
  genre?: string | null;
  feed?: FeedType | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Fire-and-forget event tracking.
 * Appends raw event to RTDB /userEvents/{uid} and updates /userSignals/{uid} rollup incrementally.
 */
export function trackEvent(params: TrackEventParams): void {
  const { type, postId, authorId, genre, feed, userId, meta } = params;
  const ts = new Date().toISOString();
  const weight = EVENT_AFFINITY_WEIGHTS[type] ?? 0;

  // 1. Update session signals in memory
  if (genre && weight !== 0) {
    sessionSignals.genres = sessionSignals.genres || {};
    sessionSignals.genres[genre] = (sessionSignals.genres[genre] || 0) + weight;
  }
  if (authorId && weight !== 0) {
    sessionSignals.authors = sessionSignals.authors || {};
    sessionSignals.authors[authorId] = (sessionSignals.authors[authorId] || 0) + weight;
  }
  if (type === "not_interested" && postId) {
    sessionSignals.hiddenPostIds = sessionSignals.hiddenPostIds || {};
    sessionSignals.hiddenPostIds[postId] = true;
  }
  if (type === "hide") {
    if (postId) {
      sessionSignals.hiddenPostIds = sessionSignals.hiddenPostIds || {};
      sessionSignals.hiddenPostIds[postId] = true;
    }
    if (authorId) {
      sessionSignals.hiddenAuthorIds = sessionSignals.hiddenAuthorIds || {};
      sessionSignals.hiddenAuthorIds[authorId] = true;
    }
  }
  persistSessionSignals();

  // 2. If logged in and Firebase configured, persist to RTDB
  if (!userId || !isFirebaseConfigured()) {
    return;
  }

  const record: UserEventRecord = {
    type,
    postId: postId || null,
    authorId: authorId || null,
    feed: feed || null,
    ts,
    meta: meta || null,
  };

  // Run in background without blocking
  void (async () => {
    try {
      await appendUserEventRtdb(userId, record);

      // Rollup updates
      const deltaSignals: Partial<UserSignals> = {};

      if (genre && weight !== 0) {
        deltaSignals.genres = { [genre]: weight };
      }
      if (authorId && weight !== 0) {
        deltaSignals.authors = { [authorId]: weight };
      }
      if (type === "not_interested" && postId) {
        deltaSignals.hiddenPostIds = { [postId]: true };
      }
      if (type === "hide") {
        deltaSignals.hiddenPostIds = postId ? { [postId]: true } : {};
        deltaSignals.hiddenAuthorIds = authorId ? { [authorId]: true } : {};
      }

      if (Object.keys(deltaSignals).length > 0) {
        await updateUserSignalsRtdb(userId, deltaSignals);
      }
    } catch (err) {
      console.warn("[Events] Failed to record event:", err);
    }
  })();
}

/**
 * Fetch remote user signals from RTDB and merge with local session signals.
 */
export async function loadUserSignals(userId?: string | null): Promise<UserSignals> {
  const merged: UserSignals = {
    genres: { ...(sessionSignals.genres || {}) },
    authors: { ...(sessionSignals.authors || {}) },
    hiddenPostIds: { ...(sessionSignals.hiddenPostIds || {}) },
    hiddenAuthorIds: { ...(sessionSignals.hiddenAuthorIds || {}) },
  };

  if (userId && isFirebaseConfigured()) {
    try {
      const remote = await getUserSignalsRtdb(userId);
      if (remote) {
        merged.genres = { ...(remote.genres || {}), ...merged.genres };
        merged.authors = { ...(remote.authors || {}), ...merged.authors };
        merged.hiddenPostIds = { ...(remote.hiddenPostIds || {}), ...merged.hiddenPostIds };
        merged.hiddenAuthorIds = { ...(remote.hiddenAuthorIds || {}), ...merged.hiddenAuthorIds };
        merged.updatedAt = remote.updatedAt;
      }
    } catch {
      // Return session signals on network failure
    }
  }

  return merged;
}
