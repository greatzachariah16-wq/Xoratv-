import { queryOptions } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/integrations/firebase/config";
import type {
  FeedType,
  ProfileRecord,
  PostRecord,
  CommentRecord,
  NotificationRecord,
  Tables,
} from "@/integrations/firebase/types";
import { SEED_HORROR_MOVIES } from "@/integrations/firebase/movies";
import { resolveMediaUrl } from "@/lib/media";

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
    body: "The tension build-up in this film is legendary. Cloudflare R2 streaming quality looks crisp!",
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

export function feedQuery(feed: FeedType) {
  return queryOptions({
    queryKey: ["feed", feed],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (isFirebaseConfigured()) {
        try {
          const q = query(
            collection(db, "posts"),
            where("feed", "==", feed),
            where("status", "==", "published"),
            where("approval_status", "==", "approved"),
            orderBy("recommendation_score", "desc"),
            limit(30),
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            return snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<PostWithAuthor, "id">),
            }));
          }
        } catch (err) {
          console.warn("[Firestore] Query feed fallback to catalog:", err);
        }
      }

      // Filter and sort local horror catalog
      const items = localPosts.filter(
        (p) => p.feed === feed && p.status === "published" && p.approval_status === "approved",
      );

      return items.sort((a, b) => {
        if (b.featured !== a.featured) return b.featured ? 1 : -1;
        return (b.recommendation_score ?? 0) - (a.recommendation_score ?? 0);
      });
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
      return localPosts.filter((p) => p.source !== "creator");
    },
  });
}

export function discoveryRunsQuery() {
  return queryOptions({
    queryKey: ["admin", "discovery-runs"],
    queryFn: async () => {
      return [
        {
          id: "run-1",
          started_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          completed_at: new Date(Date.now() - 3600000 * 23.9).toISOString(),
          source: "Cloudflare R2 & Open Web",
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
          const snap = await getDoc(doc(db, "posts", id));
          if (snap.exists()) {
            return { id: snap.id, ...(snap.data() as Omit<PostWithAuthor, "id">) };
          }
        } catch (err) {
          console.warn("[Firestore] Post query fallback:", err);
        }
      }

      const match = localPosts.find((p) => p.id === id);
      return match ?? null;
    },
  });
}

export function profileQuery(username: string) {
  return queryOptions({
    queryKey: ["profile", username],
    queryFn: async (): Promise<Profile | null> => {
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
      return localPosts.filter((p) => p.author_id === userId && p.status === "published");
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
      const people = localProfiles.filter(
        (p) =>
          p.username.toLowerCase().includes(q) ||
          (p.display_name && p.display_name.toLowerCase().includes(q)),
      );
      const posts = localPosts.filter(
        (p) =>
          p.status === "published" &&
          ((p.title && p.title.toLowerCase().includes(q)) ||
            (p.caption && p.caption.toLowerCase().includes(q)) ||
            (p.genre && p.genre.toLowerCase().includes(q))),
      );
      return { people, posts };
    },
  });
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  const key = `${postId}:${userId}`;
  if (liked) {
    localLikes.delete(key);
  } else {
    localLikes.add(key);
  }
}

export async function deletePost(postId: string) {
  localPosts = localPosts.filter((p) => p.id !== postId);
  if (isFirebaseConfigured()) {
    try {
      await deleteDoc(doc(db, "posts", postId));
    } catch (err) {
      console.warn("[Firestore] Failed to delete remote post:", err);
    }
  }
}

export async function toggleFollow(targetId: string, userId: string, following: boolean) {
  const key = `${userId}:${targetId}`;
  if (following) {
    localFollows.delete(key);
  } else {
    localFollows.add(key);
  }
}

export function adminStatsQuery() {
  return queryOptions({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      return {
        users: localProfiles.length + 12,
        posts: localPosts.length,
        comments: localComments.length,
        flagged: 0,
      };
    },
  });
}

export function adminPostsQuery() {
  return queryOptions({
    queryKey: ["admin", "posts"],
    queryFn: async (): Promise<PostWithAuthor[]> => {
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
  return newComment;
}

export function deleteLocalComment(id: string) {
  localComments = localComments.filter((c) => c.id !== id);
}

export function addLocalPost(post: Omit<PostRecord, "id" | "created_at">): string {
  const id = `horror-${Date.now()}`;
  const record: PostWithAuthor = {
    ...post,
    id,
    created_at: new Date().toISOString(),
    stream_url: post.media_path ? resolveMediaUrl("videos", post.media_path) : null,
    featured: false,
    recommendation_score: 90,
    source: "Cloudflare R2",
    author: {
      id: post.author_id || "creator",
      username: "creator",
      display_name: "Creator",
      avatar_url: null,
      location: null,
    },
  };
  localPosts = [record, ...localPosts];
  return id;
}

export function updateLocalPostStatus(id: string, status: "published" | "removed") {
  localPosts = localPosts.map((p) => (p.id === id ? { ...p, status } : p));
}

export function markNotificationsAsRead(userId: string) {
  localNotifications = localNotifications.map((n) =>
    n.user_id === userId ? { ...n, read: true } : n,
  );
}
