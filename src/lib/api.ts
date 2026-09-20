import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import { isFirebaseConfigured } from "@/integrations/firebase/config";
import { resolveMediaUrl } from "@/lib/media";
import type {
  FeedType,
  ProfileRecord,
  PostRecord,
  CommentRecord,
  NotificationRecord,
  DiscoveryRunRecord,
} from "@/integrations/firebase/types";
import {
  getPost,
  setPostRecord,
  deletePostRecord,
  getFeedPosts,
  getAllPosts,
  getProfile,
  getAllRegisteredProfiles,
  setProfile,
  getProfileByUsername,
  getCommentsForPost,
  addCommentToPost,
  removeCommentFromPost,
  toggleLikeRtdb,
  getUserLikedPosts,
  getFollowsForUser,
  toggleFollowRtdb,
  getNotificationsForUser,
  addNotificationForUser,
  markNotificationsReadRtdb,
  getDiscoveryRunsFromRtdb,
  recordDiscoveryRun,
} from "@/integrations/firebase/rtdb";
import { rankPostsForUser, getOrCreateSessionId, type RankContext } from "./ranking";
import { loadUserSignals, trackEvent } from "./events";
import { SEED_HORROR_MOVIES } from "@/integrations/firebase/movies";

export type { FeedType };
export type Profile = ProfileRecord;

export type PostWithAuthor = PostRecord & {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "location"> | null;
};

// In-memory / local state cache for instant reactivity and offline/preview operation
let localPosts: PostWithAuthor[] = [...SEED_HORROR_MOVIES];

const localProfiles: ProfileRecord[] = [
  {
    id: "studio-vault",
    username: "vault_cinema",
    display_name: "Horror Vault Classic",
    avatar_url:
      "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=150&auto=format&fit=crop&q=80",
    bio: "Curator of remastered horror classics, gothic horror, and monster features.",
    location: "Pittsburgh, PA",
    created_at: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
  },
  {
    id: "indie-fear",
    username: "dark_tales",
    display_name: "Dark Tales Studio",
    avatar_url:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80",
    bio: "Supernatural horror and psychological thrillers.",
    location: "Hollywood, CA",
    created_at: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
  },
  {
    id: "creature-lab",
    username: "cinema_curator",
    display_name: "Cinema Historian",
    avatar_url:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    bio: "Preserving vintage expressionist horror and modern experimental cinema.",
    location: "Berlin, Germany",
    created_at: new Date(Date.now() - 3600000 * 24 * 15).toISOString(),
  },
];

let localComments: (CommentRecord & {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
})[] = [
  {
    id: "c-1",
    post_id: "horror-001",
    author_id: "indie-fear",
    body: "The tension build-up in this film is legendary. The streaming quality looks crisp!",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    author: {
      id: "indie-fear",
      username: "dark_tales",
      display_name: "Dark Tales Studio",
      avatar_url:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80",
    },
  },
  {
    id: "c-2",
    post_id: "horror-002",
    author_id: "studio-vault",
    body: "A century later, Count Orlok's shadow is still iconic horror imagery.",
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    author: {
      id: "studio-vault",
      username: "vault_cinema",
      display_name: "Horror Vault Classic",
      avatar_url:
        "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=150&auto=format&fit=crop&q=80",
    },
  },
];

const localLikes = new Set<string>(["horror-001:demo-user", "horror-002:demo-user"]);
const localFollows = new Set<string>(["demo-user:studio-vault"]);
let localNotifications: NotificationRow[] = [
  {
    id: "notif-1",
    user_id: "demo-user",
    actor_id: "studio-vault",
    kind: "like",
    post_id: "horror-001",
    read: false,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    actor: {
      id: "studio-vault",
      username: "vault_cinema",
      display_name: "Horror Vault Classic",
      avatar_url:
        "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=150&auto=format&fit=crop&q=80",
    },
  },
];

const profileMemoryCache = new Map<string, ProfileRecord>();

async function attachAuthor(post: PostRecord): Promise<PostWithAuthor> {
  let authorProfile = localProfiles.find((p) => p.id === post.author_id);
  if (!authorProfile && post.author_id) {
    if (profileMemoryCache.has(post.author_id)) {
      authorProfile = profileMemoryCache.get(post.author_id);
    } else if (isFirebaseConfigured()) {
      try {
        const remote = await getProfile(post.author_id);
        if (remote) {
          profileMemoryCache.set(post.author_id, remote);
          authorProfile = remote;
        }
      } catch {
        // ignore fallback
      }
    }
  }

  return {
    ...post,
    author: authorProfile
      ? {
          id: authorProfile.id,
          username: authorProfile.username,
          display_name: authorProfile.display_name,
          avatar_url: authorProfile.avatar_url,
          location: authorProfile.location ?? null,
        }
      : {
          id: post.author_id || "creator",
          username: "creator",
          display_name: "Creator",
          avatar_url: null,
          location: null,
        },
  };
}

export async function fetchRankedFeed(
  feed: FeedType,
  userId?: string | null,
  mode: "for_you" | "following" = "for_you",
): Promise<PostWithAuthor[]> {
  let rawPosts: PostRecord[] = [];

  if (isFirebaseConfigured()) {
    try {
      const rtdbPosts = await getFeedPosts(feed);
      if (rtdbPosts && rtdbPosts.length > 0) {
        rawPosts = rtdbPosts;
      }
    } catch (err) {
      console.warn("[RealtimeDB] Query feed error:", err);
    }
  }

  if (rawPosts.length === 0) {
    rawPosts = localPosts.filter((p) => p.feed === feed);
    // Auto-seed to RTDB so persistent database is initialized with verified baseline catalog
    if (isFirebaseConfigured() && rawPosts.length > 0) {
      rawPosts.forEach((post) => {
        setPostRecord(post).catch(() => {});
      });
    }
  }

  // 1. If following mode requested on Home feed
  if (feed === "home" && mode === "following") {
    let follows: string[] = [];
    if (userId) {
      if (isFirebaseConfigured()) {
        follows = await getFollowsForUser(userId).catch(() => []);
      }
      if (follows.length === 0) {
        const userPrefix = `${userId}:`;
        localFollows.forEach((entry) => {
          if (entry.startsWith(userPrefix)) {
            follows.push(entry.substring(userPrefix.length));
          }
        });
      }
    }

    const followingPosts = rawPosts.filter(
      (p) =>
        p.status === "published" &&
        p.approval_status === "approved" &&
        p.author_id &&
        follows.includes(p.author_id),
    );

    // Sort chronologically for following graph
    followingPosts.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return await Promise.all(followingPosts.map((p) => attachAuthor(p)));
  }

  // 2. "For You" Recommendation Layer (Provider-Agnostic with Session Mixing)
  const sessionId = getOrCreateSessionId();
  let follows: string[] = [];
  let likedPostIds: string[] = [];

  if (userId) {
    if (isFirebaseConfigured()) {
      try {
        const [f, l] = await Promise.all([
          getFollowsForUser(userId).catch(() => []),
          getUserLikedPosts(userId).catch(() => []),
        ]);
        follows = f;
        likedPostIds = l;
      } catch {
        // fallback
      }
    }
    if (follows.length === 0) {
      const userPrefix = `${userId}:`;
      localFollows.forEach((entry) => {
        if (entry.startsWith(userPrefix)) {
          follows.push(entry.substring(userPrefix.length));
        }
      });
    }
    if (likedPostIds.length === 0) {
      const userPrefix = `${userId}:`;
      localLikes.forEach((entry) => {
        const [pId, uId] = entry.split(":");
        if (uId === userId || entry.startsWith(userPrefix)) {
          likedPostIds.push(pId);
        }
      });
    }
  }

  const signals = await loadUserSignals(userId);

  const rankCtx: RankContext = {
    userId: userId || null,
    sessionId,
    follows,
    likedPostIds,
    signals,
    feed,
  };

  const ranked = rankPostsForUser(rawPosts, rankCtx);
  return await Promise.all(ranked.map((p) => attachAuthor(p)));
}

export function feedQuery(
  feed: FeedType,
  userId?: string | null,
  mode: "for_you" | "following" = "for_you",
) {
  return queryOptions({
    queryKey: ["feed", feed, userId || "guest", mode],
    queryFn: () => fetchRankedFeed(feed, userId, mode),
  });
}

export function feedInfiniteQuery(
  feed: FeedType,
  userId?: string | null,
  mode: "for_you" | "following" = "for_you",
  pageSize: number = 10,
) {
  return infiniteQueryOptions({
    queryKey: ["feed-infinite", feed, userId || "guest", mode],
    initialPageParam: 0,
    getNextPageParam: (lastPage: PostWithAuthor[], allPages: PostWithAuthor[][]) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      return allPages.length;
    },
    queryFn: async ({ pageParam = 0 }): Promise<PostWithAuthor[]> => {
      const allRanked = await fetchRankedFeed(feed, userId, mode);
      const start = Number(pageParam) * pageSize;
      return allRanked.slice(start, start + pageSize);
    },
  });
}

export type DiscoveryQueueKey =
  | "recommended"
  | "pending"
  | "approved"
  | "rejected"
  | "rights_uncertain"
  | "low_quality"
  | "black_and_white"
  | "new";

export function discoveryPostsQuery(queue: DiscoveryQueueKey) {
  return queryOptions({
    queryKey: ["admin", "discovery", queue],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (isFirebaseConfigured()) {
        try {
          const posts = await getAllPosts();
          if (posts.length > 0) {
            return await Promise.all(posts.filter((p) => p.source !== "creator").map(attachAuthor));
          }
        } catch (err) {
          console.warn("[RealtimeDB] Discovery posts query note:", err);
        }
      }
      return localPosts.filter((p) => p.source !== "creator");
    },
  });
}

export function discoveryRunsQuery() {
  return queryOptions({
    queryKey: ["admin", "discovery-runs"],
    queryFn: async (): Promise<DiscoveryRunRecord[]> => {
      if (isFirebaseConfigured()) {
        try {
          const runs = await getDiscoveryRunsFromRtdb();
          if (runs.length > 0) {
            return runs;
          }
        } catch (err) {
          console.warn("[RealtimeDB] Discovery runs note:", err);
        }
      }
      return [
        {
          id: "run-1",
          started_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          completed_at: new Date(Date.now() - 3600000 * 23.9).toISOString(),
          source: "Open Web Discovery",
          items_found: 18,
          items_inserted: 6,
        },
      ];
    },
  });
}

export function postQuery(id: string) {
  return queryOptions({
    queryKey: ["post", id],
    queryFn: async (): Promise<PostWithAuthor | null> => {
      if (isFirebaseConfigured()) {
        try {
          const post = await getPost(id);
          if (post) {
            return await attachAuthor(post);
          }
        } catch (err) {
          console.warn("[RealtimeDB] Post query fallback:", err);
        }
      }

      const match = localPosts.find((p) => p.id === id);
      if (match) return await attachAuthor(match);
      return null;
    },
  });
}

export function profileQuery(username: string) {
  return queryOptions({
    queryKey: ["profile", username],
    queryFn: async (): Promise<Profile | null> => {
      if (isFirebaseConfigured()) {
        try {
          const profile = await getProfileByUsername(username);
          if (profile) return profile;
        } catch (err) {
          console.warn("[RealtimeDB] Profile query note:", err);
        }
      }

      const match = localProfiles.find((p) => p.username.toLowerCase() === username.toLowerCase());
      if (match) return match;

      return {
        id: `user-${username}`,
        username,
        display_name: username,
        avatar_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
        bio: "Horror cinema enthusiast and collector.",
        created_at: new Date().toISOString(),
      };
    },
  });
}

export function profilePostsQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["profile-posts", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (isFirebaseConfigured() && userId) {
        try {
          const all = await getAllPosts();
          if (all.length > 0) {
            return await Promise.all(
              all
                .filter((p) => p.author_id === userId && p.status === "published")
                .map(attachAuthor),
            );
          }
        } catch (err) {
          console.warn("[RealtimeDB] Profile posts query note:", err);
        }
      }
      return await Promise.all(
        localPosts
          .filter((p) => p.author_id === userId && p.status === "published")
          .map(attachAuthor),
      );
    },
  });
}

export type CommentWithAuthor = CommentRecord & {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
};

export function commentsQuery(postId: string) {
  return queryOptions({
    queryKey: ["comments", postId],
    queryFn: async (): Promise<CommentWithAuthor[]> => {
      if (isFirebaseConfigured()) {
        try {
          const comments = await getCommentsForPost(postId);
          if (comments.length > 0) {
            return comments.map((c) => {
              const author = localProfiles.find((p) => p.id === c.author_id);
              return {
                ...c,
                author: author
                  ? {
                      id: author.id,
                      username: author.username,
                      display_name: author.display_name,
                      avatar_url: author.avatar_url,
                    }
                  : {
                      id: c.author_id,
                      username: "viewer",
                      display_name: "Viewer",
                      avatar_url: null,
                    },
              };
            });
          }
        } catch (err) {
          console.warn("[RealtimeDB] Comments query fallback:", err);
        }
      }
      return localComments.filter((c) => c.post_id === postId);
    },
  });
}

export function myLikesQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["my-likes", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      if (isFirebaseConfigured()) {
        try {
          const liked = await getUserLikedPosts(userId);
          if (liked.length > 0) return liked;
        } catch (err) {
          console.warn("[RealtimeDB] Likes query fallback:", err);
        }
      }
      const userPrefix = `${userId}:`;
      const likedPostIds: string[] = [];
      localLikes.forEach((entry) => {
        const [pId, uId] = entry.split(":");
        if (uId === userId || entry.startsWith(userPrefix)) {
          likedPostIds.push(pId);
        }
      });
      return likedPostIds;
    },
  });
}

export function myFollowsQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["my-follows", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      if (isFirebaseConfigured()) {
        try {
          const follows = await getFollowsForUser(userId);
          if (follows.length > 0) return follows;
        } catch (err) {
          console.warn("[RealtimeDB] Follows query fallback:", err);
        }
      }
      const userPrefix = `${userId}:`;
      const follows: string[] = [];
      localFollows.forEach((entry) => {
        if (entry.startsWith(userPrefix)) {
          follows.push(entry.substring(userPrefix.length));
        }
      });
      return follows;
    },
  });
}

export type NotificationRow = NotificationRecord & {
  actor: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
};

export function notificationsQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["notifications", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userId) return [];
      if (isFirebaseConfigured()) {
        try {
          const notifs = await getNotificationsForUser(userId);
          if (notifs.length > 0) {
            return notifs.map((n) => {
              const actor =
                n.actor_id === "xora_support_admin"
                  ? {
                      id: "xora_support_admin",
                      username: "xora_support",
                      display_name: "Xora Support Team",
                      avatar_url: null,
                    }
                  : localProfiles.find((p) => p.id === n.actor_id);
              return {
                ...n,
                actor: actor
                  ? {
                      id: actor.id,
                      username: actor.username,
                      display_name: actor.display_name,
                      avatar_url: actor.avatar_url,
                    }
                  : null,
              };
            });
          }
        } catch (err) {
          console.warn("[RealtimeDB] Notifications query note:", err);
        }
      }
      return localNotifications.filter((n) => n.user_id === userId || n.user_id === "demo-user");
    },
  });
}

export function searchQuery(term: string) {
  return queryOptions({
    queryKey: ["search", term],
    enabled: term.trim().length > 1,
    queryFn: async () => {
      const q = term.trim().toLowerCase();
      let postList: PostRecord[] = localPosts;

      if (isFirebaseConfigured()) {
        try {
          postList = await getAllPosts();
        } catch (err) {
          console.warn("[RealtimeDB] Search query error:", err);
        }
      }

      // Execute live smart multi-provider search (YouTube, Vimeo, Dailymotion, NOAA)
      // specifically targeting full movies >= 40 minutes (2400s) to 1hr+
      try {
        const { searchAllProvidersWithStatus } = await import("@/integrations/providers");
        const liveRes = await searchAllProvidersWithStatus({
          query: term,
          limit: 8,
          minDurationSeconds: 2400, // strictly 40 minutes upwards
          feed: "home",
          autoPublishTrusted: true,
        });

        if (liveRes.candidates.length > 0) {
          const livePosts: PostRecord[] = liveRes.candidates
            .filter((c) => {
              // Nothing less than 40 minutes (2400s)
              if (typeof c.durationSeconds === "number" && c.durationSeconds < 2400) return false;
              return true;
            })
            .map((c) => ({
              id: c.id,
              author_id: c.authorId || `creator_${c.provider}`,
              caption: c.description || c.title,
              title: c.title,
              video_url: c.externalUrl || c.streamUrl || "",
              stream_url: c.streamUrl || null,
              thumbnail_url: c.thumbnailUrl || null,
              likes_count: 0,
              comments_count: 0,
              views_count: 0,
              created_at: new Date().toISOString(),
              status: "published" as const,
              feed: "home" as const,
              source: c.provider,
              rights_status: "public_domain" as const,
              duration_seconds: c.durationSeconds || 2400,
            }));

          const existingIds = new Set(postList.map((p) => p.id));
          for (const lp of livePosts) {
            if (!existingIds.has(lp.id)) {
              postList.push(lp);
              existingIds.add(lp.id);
            }
          }
        }
      } catch (liveSearchErr) {
        console.warn("[Smart Search Engine] Live provider search warning:", liveSearchErr);
      }

      const people = localProfiles.filter(
        (p) =>
          p.username.toLowerCase().includes(q) ||
          (p.display_name && p.display_name.toLowerCase().includes(q)),
      );

      const posts = postList
        .filter((p) => {
          if (p.status !== "published") return false;
          // Duration constraint: Normal search strictly enforces movies that are 40 minutes (2400s) / 1 hour upwards, nothing less
          if (p.feed === "shorts") return false;
          if (typeof p.duration_seconds === "number" && p.duration_seconds < 2400) {
            return false;
          }
          return (
            (p.title && p.title.toLowerCase().includes(q)) ||
            (p.caption && p.caption.toLowerCase().includes(q)) ||
            (p.genre && p.genre.toLowerCase().includes(q))
          );
        })
        .slice(0, 30)
        .map(attachAuthor);

      return { people, posts: await Promise.all(posts) };
    },
  });
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  const key = `${postId}:${userId}`;
  if (liked) {
    localLikes.delete(key);
    trackEvent({ type: "skip", postId, userId });
  } else {
    localLikes.add(key);
    trackEvent({ type: "like", postId, userId });
  }

  if (isFirebaseConfigured()) {
    try {
      await toggleLikeRtdb(postId, userId, liked);
    } catch (err) {
      console.warn("[RealtimeDB] Toggle like note:", err);
    }
  }
}

export async function deletePost(postId: string, feed: FeedType = "home") {
  localPosts = localPosts.filter((p) => p.id !== postId);
  if (isFirebaseConfigured()) {
    try {
      await deletePostRecord(postId, feed);
    } catch (err) {
      console.warn("[RealtimeDB] Failed to delete remote post:", err);
    }
  }
}

export async function toggleFollow(targetId: string, userId: string, following: boolean) {
  const key = `${userId}:${targetId}`;
  if (following) {
    localFollows.delete(key);
  } else {
    localFollows.add(key);
    trackEvent({ type: "follow", authorId: targetId, userId });
  }

  if (isFirebaseConfigured()) {
    try {
      await toggleFollowRtdb(userId, targetId, following);
    } catch (err) {
      console.warn("[RealtimeDB] Toggle follow note:", err);
    }
  }
}

export function markNotInterestedAction(
  postId: string,
  genre?: string | null,
  userId?: string | null,
) {
  trackEvent({ type: "not_interested", postId, genre, userId });
}

export function hideCreatorAction(postId: string, authorId: string, userId?: string | null) {
  trackEvent({ type: "hide", postId, authorId, userId });
}

export function adminStatsQuery() {
  return queryOptions({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      let registeredUsersCount = 0;
      const totalPosts = localPosts.length;
      const totalComments = localComments.length;

      if (isFirebaseConfigured()) {
        try {
          const profiles = await getAllRegisteredProfiles();
          registeredUsersCount = profiles ? profiles.length : 0;
        } catch {
          registeredUsersCount = 0;
        }
      } else {
        registeredUsersCount = localProfiles.length;
      }

      return {
        users: registeredUsersCount,
        posts: totalPosts,
        comments: totalComments,
        flagged: 0,
      };
    },
  });
}

export function adminRegisteredUsersQuery() {
  return queryOptions({
    queryKey: ["admin", "registered-users-list"],
    queryFn: async (): Promise<ProfileRecord[]> => {
      if (isFirebaseConfigured()) {
        try {
          const profiles = await getAllRegisteredProfiles();
          return profiles || [];
        } catch {
          return [];
        }
      }
      return localProfiles.filter((p) => Boolean(p.email || p.username));
    },
  });
}

export function adminPostsQuery() {
  return queryOptions({
    queryKey: ["admin", "posts"],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (isFirebaseConfigured()) {
        try {
          const posts = await getAllPosts();
          if (posts.length > 0) return await Promise.all(posts.map(attachAuthor));
        } catch (err) {
          console.warn("[RealtimeDB] Admin posts query note:", err);
        }
      }
      return localPosts;
    },
  });
}

export function addLocalComment(comment: { postId: string; authorId: string; body: string }) {
  const newComment: CommentWithAuthor = {
    id: `c-${Date.now()}`,
    post_id: comment.postId,
    author_id: comment.authorId,
    body: comment.body,
    created_at: new Date().toISOString(),
    author: {
      id: comment.authorId,
      username: "you",
      display_name: "You",
      avatar_url: null,
    },
  };
  localComments = [newComment, ...localComments];
  trackEvent({
    type: "comment",
    postId: comment.postId,
    authorId: comment.authorId,
    userId: comment.authorId,
  });

  if (isFirebaseConfigured()) {
    addCommentToPost(newComment).catch((err) =>
      console.warn("[RealtimeDB] Add comment note:", err),
    );
  }

  return newComment;
}

export function deleteLocalComment(id: string, postId?: string) {
  const comment = localComments.find((c) => c.id === id);
  localComments = localComments.filter((c) => c.id !== id);

  if (isFirebaseConfigured()) {
    const targetPostId = postId || comment?.post_id;
    if (targetPostId) {
      removeCommentFromPost(targetPostId, id).catch((err) =>
        console.warn("[RealtimeDB] Delete comment note:", err),
      );
    }
  }
}

export function addLocalPost(post: Omit<PostRecord, "id" | "created_at">): string {
  const id = `horror-${Date.now()}`;
  const record: PostWithAuthor = {
    ...post,
    id,
    created_at: new Date().toISOString(),
    stream_url:
      post.stream_url || (post.media_path ? resolveMediaUrl("videos", post.media_path) : null),
    featured: post.featured ?? false,
    recommendation_score: post.recommendation_score ?? 90,
    source: post.source || "creator",
    author: {
      id: post.author_id || "creator",
      username: "creator",
      display_name: "Creator",
      avatar_url: null,
      location: null,
    },
  };
  localPosts = [record, ...localPosts];

  if (isFirebaseConfigured()) {
    setPostRecord(record).catch((err) => console.warn("[RealtimeDB] Add post note:", err));
  }

  return id;
}

export function updateLocalPostStatus(id: string, status: "published" | "removed") {
  localPosts = localPosts.map((p) => (p.id === id ? { ...p, status } : p));
  if (isFirebaseConfigured()) {
    getPost(id)
      .then((p) => {
        if (p) {
          return setPostRecord({ ...p, status });
        }
      })
      .catch((err) => console.warn("[RealtimeDB] Update post status note:", err));
  }
}

export function markNotificationsAsRead(userId: string) {
  localNotifications = localNotifications.map((n) =>
    n.user_id === userId ? { ...n, read: true } : n,
  );
  if (isFirebaseConfigured()) {
    markNotificationsReadRtdb(userId).catch((err) =>
      console.warn("[RealtimeDB] Mark read note:", err),
    );
  }
}
