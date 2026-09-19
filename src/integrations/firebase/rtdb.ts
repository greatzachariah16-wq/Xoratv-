import {
  ref,
  get,
  set,
  update,
  remove,
  push,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  onValue,
  type DatabaseReference,
  type QueryConstraint,
} from "firebase/database";
import { rtdb } from "./config";
import type {
  PostRecord,
  ProfileRecord,
  CommentRecord,
  NotificationRecord,
  DiscoveryRunRecord,
  FeedType,
  UserSignals,
  UserEventRecord,
} from "./types";

// Re-export core RTDB functions for convenience
export { ref, get, set, update, remove, push, query, orderByChild, equalTo, limitToLast, onValue };

/**
 * Firebase RTDB keys cannot contain ".", "#", "$", "[", "]", or "/"
 */
export function pathSafe(key: string): string {
  return key.replace(/[.#$[\]/]/g, "_");
}

export function hashKey(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return pathSafe(`${Math.abs(hash)}_${str.slice(0, 32)}`);
}

/**
 * Recursively removes `undefined` properties from an object so Firebase Realtime Database `set()` doesn't reject them.
 */
export function sanitizeForRtdb<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForRtdb(item)) as unknown as T;
  }
  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForRtdb(value);
      }
    }
    return cleaned as unknown as T;
  }
  return obj;
}

export interface MediaIndexEntry {
  postId?: string | null;
  objectKey: string;
  renderUrl: string;
  bucket: "videos" | "posters" | "avatars" | string;
  ownerId?: string | null;
  created_at: string;
}

export interface PostFeedIndexEntry {
  created_at: string;
  recommendation_score: number;
  status: "published" | "draft" | "removed";
  approval_status: "approved" | "pending_review" | "rejected";
}

/**
 * RTDB Helper functions for strict JSON tree schema
 */

// --- PROFILES & USERNAMES ---
export async function getProfile(uid: string): Promise<ProfileRecord | null> {
  const snapshot = await get(ref(rtdb, `profiles/${pathSafe(uid)}`));
  return snapshot.exists() ? (snapshot.val() as ProfileRecord) : null;
}

export async function setProfile(profile: ProfileRecord): Promise<void> {
  const safeUid = pathSafe(profile.id);
  await set(ref(rtdb, `profiles/${safeUid}`), sanitizeForRtdb(profile));
  if (profile.username) {
    const safeUsername = pathSafe(profile.username.toLowerCase());
    await set(ref(rtdb, `usernames/${safeUsername}`), profile.id);
  }
}

export async function getProfileByUsername(username: string): Promise<ProfileRecord | null> {
  const safeUsername = pathSafe(username.toLowerCase());
  const uidSnap = await get(ref(rtdb, `usernames/${safeUsername}`));
  if (!uidSnap.exists()) return null;
  const uid = uidSnap.val() as string;
  return getProfile(uid);
}

// --- POSTS & POSTS BY FEED ---
export async function getPost(postId: string): Promise<PostRecord | null> {
  const snap = await get(ref(rtdb, `posts/${pathSafe(postId)}`));
  return snap.exists() ? (snap.val() as PostRecord) : null;
}

export async function setPostRecord(post: PostRecord): Promise<void> {
  const safeId = pathSafe(post.id);
  await set(ref(rtdb, `posts/${safeId}`), sanitizeForRtdb(post));

  // Write to postsByFeed
  const feed = post.feed || "home";
  const feedEntry: PostFeedIndexEntry = {
    created_at: post.created_at,
    recommendation_score: post.recommendation_score ?? 50,
    status: post.status,
    approval_status: post.approval_status,
  };
  await set(ref(rtdb, `postsByFeed/${feed}/${safeId}`), sanitizeForRtdb(feedEntry));

  // Write media index if media object exists
  if (post.media_path) {
    const objectKey = post.media_path;
    const keyHash = hashKey(objectKey);
    const mediaEntry: MediaIndexEntry = {
      postId: post.id,
      objectKey,
      renderUrl: post.stream_url || "",
      bucket: "videos",
      ownerId: post.author_id,
      created_at: post.created_at,
    };
    await set(ref(rtdb, `mediaIndex/videos/${keyHash}`), sanitizeForRtdb(mediaEntry));
  }
  if (post.poster_path) {
    const objectKey = post.poster_path;
    const keyHash = hashKey(objectKey);
    const posterEntry: MediaIndexEntry = {
      postId: post.id,
      objectKey,
      renderUrl: post.poster_path,
      bucket: "posters",
      ownerId: post.author_id,
      created_at: post.created_at,
    };
    await set(ref(rtdb, `mediaIndex/posters/${keyHash}`), sanitizeForRtdb(posterEntry));
  }
}

export async function deletePostRecord(postId: string, feed: FeedType = "home"): Promise<void> {
  const safeId = pathSafe(postId);
  await remove(ref(rtdb, `posts/${safeId}`));
  await remove(ref(rtdb, `postsByFeed/${feed}/${safeId}`));
  await remove(ref(rtdb, `comments/${safeId}`));
  await remove(ref(rtdb, `likes/${safeId}`));
}

export async function getAllPosts(): Promise<PostRecord[]> {
  const snap = await get(ref(rtdb, "posts"));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Object.values(val) as PostRecord[];
}

export async function getFeedPosts(feed: FeedType): Promise<PostRecord[]> {
  const feedSnap = await get(ref(rtdb, `postsByFeed/${feed}`));
  if (!feedSnap.exists()) {
    // Fallback: check /posts directly
    const all = await getAllPosts();
    return all.filter(
      (p) => p.feed === feed && p.status === "published" && p.approval_status === "approved",
    );
  }

  const feedMap = feedSnap.val() as Record<string, PostFeedIndexEntry>;
  const postIds = Object.keys(feedMap).filter((id) => {
    const entry = feedMap[id];
    return entry.status === "published" && entry.approval_status === "approved";
  });

  const posts: PostRecord[] = [];
  await Promise.all(
    postIds.map(async (id) => {
      const p = await getPost(id);
      if (p) posts.push(p);
    }),
  );

  return posts.sort((a, b) => {
    if (b.featured !== a.featured) return b.featured ? 1 : -1;
    return (b.recommendation_score ?? 0) - (a.recommendation_score ?? 0);
  });
}

// --- COMMENTS ---
export async function getCommentsForPost(postId: string): Promise<CommentRecord[]> {
  const snap = await get(ref(rtdb, `comments/${pathSafe(postId)}`));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Object.values(val) as CommentRecord[];
}

export async function addCommentToPost(comment: CommentRecord): Promise<void> {
  const safePostId = pathSafe(comment.post_id);
  const safeCommentId = pathSafe(comment.id);
  await set(ref(rtdb, `comments/${safePostId}/${safeCommentId}`), sanitizeForRtdb(comment));
}

export async function removeCommentFromPost(postId: string, commentId: string): Promise<void> {
  await remove(ref(rtdb, `comments/${pathSafe(postId)}/${pathSafe(commentId)}`));
}

// --- LIKES ---
export async function getLikesForPost(
  postId: string,
): Promise<Record<string, { created_at: string }>> {
  const snap = await get(ref(rtdb, `likes/${pathSafe(postId)}`));
  return snap.exists() ? snap.val() : {};
}

export async function toggleLikeRtdb(postId: string, uid: string, liked: boolean): Promise<void> {
  const safePostId = pathSafe(postId);
  const safeUid = pathSafe(uid);
  const likeRef = ref(rtdb, `likes/${safePostId}/${safeUid}`);
  if (liked) {
    await remove(likeRef);
  } else {
    await set(likeRef, { created_at: new Date().toISOString() });
  }
}

export async function getUserLikedPosts(uid: string): Promise<string[]> {
  const snap = await get(ref(rtdb, "likes"));
  if (!snap.exists()) return [];
  const allLikes = snap.val() as Record<string, Record<string, { created_at: string }>>;
  const liked: string[] = [];
  const safeUid = pathSafe(uid);
  for (const [postId, users] of Object.entries(allLikes)) {
    if (users && users[safeUid]) {
      liked.push(postId);
    }
  }
  return liked;
}

// --- FOLLOWS ---
export async function getFollowsForUser(uid: string): Promise<string[]> {
  const snap = await get(ref(rtdb, `follows/${pathSafe(uid)}`));
  if (!snap.exists()) return [];
  return Object.keys(snap.val());
}

export async function toggleFollowRtdb(
  uid: string,
  targetUid: string,
  following: boolean,
): Promise<void> {
  const safeUid = pathSafe(uid);
  const safeTarget = pathSafe(targetUid);
  const followRef = ref(rtdb, `follows/${safeUid}/${safeTarget}`);
  if (following) {
    await remove(followRef);
  } else {
    await set(followRef, { created_at: new Date().toISOString() });
  }
}

// --- NOTIFICATIONS ---
export async function getNotificationsForUser(uid: string): Promise<NotificationRecord[]> {
  const snap = await get(ref(rtdb, `notifications/${pathSafe(uid)}`));
  if (!snap.exists()) return [];
  return Object.values(snap.val()) as NotificationRecord[];
}

export async function addNotificationForUser(
  uid: string,
  notif: NotificationRecord,
): Promise<void> {
  const safeUid = pathSafe(uid);
  const safeNotifId = pathSafe(notif.id);
  await set(ref(rtdb, `notifications/${safeUid}/${safeNotifId}`), sanitizeForRtdb(notif));
}

export async function markNotificationsReadRtdb(uid: string): Promise<void> {
  const safeUid = pathSafe(uid);
  const snap = await get(ref(rtdb, `notifications/${safeUid}`));
  if (!snap.exists()) return;
  const val = snap.val() as Record<string, NotificationRecord>;
  const updates: Record<string, unknown> = {};
  for (const notifId of Object.keys(val)) {
    updates[`notifications/${safeUid}/${notifId}/read`] = true;
  }
  await update(ref(rtdb), updates);
}

// --- MEDIA INDEX ---
export async function recordMediaIndex(entry: MediaIndexEntry): Promise<void> {
  const bucket = pathSafe(entry.bucket || "videos");
  const keyHash = hashKey(entry.objectKey);
  await set(ref(rtdb, `mediaIndex/${bucket}/${keyHash}`), sanitizeForRtdb(entry));
}

// --- DISCOVERY RUNS ---
export async function getDiscoveryRunsFromRtdb(): Promise<DiscoveryRunRecord[]> {
  const snap = await get(ref(rtdb, "discovery_runs"));
  if (!snap.exists()) return [];
  return Object.values(snap.val()) as DiscoveryRunRecord[];
}

export async function recordDiscoveryRun(run: DiscoveryRunRecord): Promise<void> {
  await set(ref(rtdb, `discovery_runs/${pathSafe(run.id)}`), sanitizeForRtdb(run));
}

// --- USER EVENTS & SIGNALS ROLLUP ---
export async function appendUserEventRtdb(uid: string, event: UserEventRecord): Promise<void> {
  const safeUid = pathSafe(uid);
  const eventsRef = ref(rtdb, `userEvents/${safeUid}`);
  const newEventRef = push(eventsRef);
  await set(newEventRef, sanitizeForRtdb(event));
}

export async function getUserSignalsRtdb(uid: string): Promise<UserSignals | null> {
  const safeUid = pathSafe(uid);
  const snap = await get(ref(rtdb, `userSignals/${safeUid}`));
  if (!snap.exists()) return null;
  return snap.val() as UserSignals;
}

export async function updateUserSignalsRtdb(
  uid: string,
  signals: Partial<UserSignals>,
): Promise<void> {
  const safeUid = pathSafe(uid);
  const signalRef = ref(rtdb, `userSignals/${safeUid}`);
  const snap = await get(signalRef);
  const current: UserSignals = snap.exists()
    ? (snap.val() as UserSignals)
    : {
        genres: {},
        authors: {},
        hiddenPostIds: {},
        hiddenAuthorIds: {},
      };

  const updated: UserSignals = {
    genres: { ...(current.genres || {}), ...(signals.genres || {}) },
    authors: { ...(current.authors || {}), ...(signals.authors || {}) },
    hiddenPostIds: { ...(current.hiddenPostIds || {}), ...(signals.hiddenPostIds || {}) },
    hiddenAuthorIds: { ...(current.hiddenAuthorIds || {}), ...(signals.hiddenAuthorIds || {}) },
    updatedAt: new Date().toISOString(),
  };

  await set(signalRef, sanitizeForRtdb(updated));
}

// --- XTV SERIES CONTENT ENGINE ---
export interface XTvSeriesItem {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  year?: number;
  seasons?: number;
  episodesCount?: number;
  tag?: string; // "Docuseries", "Mini-series", "Independent", "Featured", etc.
  tone?: "clay" | "sage" | "ink" | "sand";
  videoUrl?: string;
  streamUrl?: string;
  thumbnailUrl?: string;
  provider?: "youtube" | "vimeo" | "dailymotion" | "faotv" | "open" | "xseries" | string;
  durationSeconds?: number;
  createdAt: string;
  categories?: string[];
}

export interface XTvSeriesRun {
  id: string;
  timestamp: string;
  itemsFound: number;
  itemsPersisted: number;
  status: "completed" | "failed";
  error?: string;
}

export async function getXTvSeriesItems(options?: {
  genre?: string;
  limitCount?: number;
}): Promise<XTvSeriesItem[]> {
  try {
    const snap = await get(ref(rtdb, "xtvSeries/items"));
    if (!snap.exists()) return [];
    let list = Object.values(snap.val()) as XTvSeriesItem[];
    if (options?.genre && options.genre !== "All") {
      const g = options.genre.toLowerCase();
      list = list.filter(
        (item) => item.genre?.toLowerCase().includes(g) || item.tag?.toLowerCase().includes(g),
      );
    }
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (options?.limitCount) {
      list = list.slice(0, options.limitCount);
    }
    return list;
  } catch (err) {
    console.warn("[RTDB] getXTvSeriesItems fallback error:", err);
    return [];
  }
}

export async function saveXTvSeriesItem(item: XTvSeriesItem): Promise<void> {
  const safeId = pathSafe(item.id);
  await set(ref(rtdb, `xtvSeries/items/${safeId}`), sanitizeForRtdb(item));
}

export async function saveXTvSeriesRun(run: XTvSeriesRun): Promise<void> {
  const safeId = pathSafe(run.id);
  await set(ref(rtdb, `xtvSeries/runs/${safeId}`), sanitizeForRtdb(run));
}
