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
import { ref, get, set, remove } from "firebase/database";
import { db, rtdb, isFirebaseConfigured } from "./config";
import type { MovieMetadata, PostRecord } from "./types";
import { resolveMediaUrl } from "@/lib/media";

export const MOVIES_COLLECTION = "movies";
export const POSTS_COLLECTION = "posts";

/**
 * Initial catalogue of full-length horror movies with Cloudflare R2 / streaming URLs.
 * Ensures instant, smooth playback and metadata rendering even before remote Firestore is seeded.
 */
export const SEED_HORROR_MOVIES: (PostRecord & {
  author?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    location: string | null;
  };
})[] = [
  {
    id: "horror-001",
    author_id: "studio-vault",
    title: "Night of the Living Dead (1968)",
    caption:
      "The quintessential zombie masterpiece. Survivors barricade themselves in a rural farmhouse while the dead return to life.",
    kind: "video",
    feed: "home",
    status: "published",
    approval_status: "approved",
    media_path: "movies/night-of-the-living-dead.mp4",
    poster_path: "posters/night-of-the-living-dead.jpg",
    stream_url: resolveMediaUrl("videos", "movies/night-of-the-living-dead.mp4"),
    duration_seconds: 5760,
    featured: true,
    recommendation_score: 98,
    quality_score: 95,
    is_color: false,
    rights_status: "public_domain",
    source: "Cloudflare R2 Public Streaming",
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    year: 1968,
    genre: "Zombie Horror",
    author: {
      id: "studio-vault",
      username: "vault_cinema",
      display_name: "Horror Vault Classic",
      avatar_url:
        "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=150&auto=format&fit=crop&q=80",
      location: "Pittsburgh, PA",
    },
  },
  {
    id: "horror-002",
    author_id: "studio-vault",
    title: "Nosferatu: A Symphony of Horror (1922)",
    caption:
      "Vampire Count Orlok stalks a small German village in this gothic silent masterpiece of expressionism and terror.",
    kind: "video",
    feed: "home",
    status: "published",
    approval_status: "approved",
    media_path: "movies/nosferatu.mp4",
    poster_path: "posters/nosferatu.jpg",
    stream_url: resolveMediaUrl("videos", "movies/nosferatu.mp4"),
    duration_seconds: 5640,
    featured: true,
    recommendation_score: 96,
    quality_score: 92,
    is_color: false,
    rights_status: "public_domain",
    source: "Cloudflare R2 Public Streaming",
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    year: 1922,
    genre: "Vampire Gothic",
    author: {
      id: "studio-vault",
      username: "vault_cinema",
      display_name: "Horror Vault Classic",
      avatar_url:
        "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=150&auto=format&fit=crop&q=80",
      location: "Wismar, Germany",
    },
  },
  {
    id: "horror-003",
    author_id: "indie-fear",
    title: "Carnival of Souls (1962)",
    caption:
      "After surviving a terrifying car plunge, Mary finds herself drawn to an abandoned pavilion inhabited by ghostly figures.",
    kind: "video",
    feed: "home",
    status: "published",
    approval_status: "approved",
    media_path: "movies/carnival-of-souls.mp4",
    poster_path: "posters/carnival-of-souls.jpg",
    stream_url: resolveMediaUrl("videos", "movies/carnival-of-souls.mp4"),
    duration_seconds: 4680,
    featured: false,
    recommendation_score: 92,
    quality_score: 88,
    is_color: false,
    rights_status: "public_domain",
    source: "Cloudflare R2 Public Streaming",
    created_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
    year: 1962,
    genre: "Supernatural Psychological",
    author: {
      id: "indie-fear",
      username: "dark_tales",
      display_name: "Dark Tales Studio",
      avatar_url:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80",
      location: "Salt Lake City, UT",
    },
  },
  {
    id: "horror-004",
    author_id: "indie-fear",
    title: "House on Haunted Hill (1959)",
    caption:
      "An eccentric millionaire invites five strangers to spend the night in a haunted mansion with a deadly $10,000 challenge.",
    kind: "video",
    feed: "home",
    status: "published",
    approval_status: "approved",
    media_path: "movies/house-on-haunted-hill.mp4",
    poster_path: "posters/house-on-haunted-hill.jpg",
    stream_url: resolveMediaUrl("videos", "movies/house-on-haunted-hill.mp4"),
    duration_seconds: 4500,
    featured: true,
    recommendation_score: 94,
    quality_score: 90,
    is_color: false,
    rights_status: "public_domain",
    source: "Cloudflare R2 Public Streaming",
    created_at: new Date(Date.now() - 3600000 * 24 * 9).toISOString(),
    year: 1959,
    genre: "Haunted House Thriller",
    author: {
      id: "indie-fear",
      username: "dark_tales",
      display_name: "Dark Tales Studio",
      avatar_url:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80",
      location: "Hollywood, CA",
    },
  },
  {
    id: "horror-005",
    author_id: "creature-lab",
    title: "The Cabinet of Dr. Caligari (1920)",
    caption:
      "A hypnotist uses a somnambulist to commit murders in this foundational psychological horror masterpiece.",
    kind: "video",
    feed: "learn",
    status: "published",
    approval_status: "approved",
    media_path: "movies/dr-caligari.mp4",
    poster_path: "posters/dr-caligari.jpg",
    stream_url: resolveMediaUrl("videos", "movies/dr-caligari.mp4"),
    duration_seconds: 4200,
    featured: false,
    recommendation_score: 91,
    quality_score: 89,
    is_color: false,
    rights_status: "public_domain",
    source: "Cloudflare R2 Public Streaming",
    created_at: new Date(Date.now() - 3600000 * 24 * 12).toISOString(),
    year: 1920,
    genre: "Psychological Classic",
    author: {
      id: "creature-lab",
      username: "cinema_curator",
      display_name: "Cinema Historian",
      avatar_url:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      location: "Berlin, Germany",
    },
  },
  {
    id: "horror-006",
    author_id: "creature-lab",
    title: "Vampire Hunter: Blood Moon Ritual (2025)",
    caption:
      "Short exclusive preview of the upcoming 2025 modern vampire hunt chronicle across the subterranean caverns.",
    kind: "video",
    feed: "shorts",
    status: "published",
    approval_status: "approved",
    media_path: "shorts/vampire-ritual.mp4",
    poster_path: "posters/vampire-ritual.jpg",
    stream_url: resolveMediaUrl("videos", "shorts/vampire-ritual.mp4"),
    duration_seconds: 45,
    featured: true,
    recommendation_score: 97,
    quality_score: 96,
    is_color: true,
    rights_status: "creative_commons",
    source: "Render Backend Streaming",
    created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
    year: 2025,
    genre: "Modern Vampire",
    author: {
      id: "creature-lab",
      username: "cinema_curator",
      display_name: "Cinema Historian",
      avatar_url:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      location: "Prague, Czechia",
    },
  },
];

/**
 * Fetch horror movie metadata list from Firestore, falling back to cached seed catalog.
 */
export async function getMoviesMetadata(limitCount = 50): Promise<MovieMetadata[]> {
  const defaultList: MovieMetadata[] = SEED_HORROR_MOVIES.map((p) => ({
    id: p.id,
    title: p.title || "Untitled Horror",
    year: p.year ?? 2024,
    genre: p.genre ?? "Horror",
    overview: p.caption,
    posterUrl: resolveMediaUrl("posters", p.poster_path),
    streamUrl: p.stream_url || resolveMediaUrl("videos", p.media_path),
    durationSeconds: p.duration_seconds,
    quality: "1080p",
    rating: 4.8,
    status: p.status,
    approval_status: p.approval_status,
    created_at: p.created_at,
    source: p.source,
  }));

  if (!isFirebaseConfigured()) {
    return defaultList;
  }

  // 1. Try Firebase Realtime Database
  try {
    const moviesRef = ref(rtdb, "movies");
    const rtdbSnap = await get(moviesRef);
    if (rtdbSnap.exists()) {
      const data = rtdbSnap.val();
      if (data && typeof data === "object") {
        const list: MovieMetadata[] = Object.values(data);
        if (list.length > 0) {
          return list.slice(0, limitCount);
        }
      }
    } else {
      // Auto-seed initial catalog into Realtime Database
      try {
        const seedMap: Record<string, MovieMetadata> = {};
        for (const item of defaultList) {
          seedMap[item.id] = item;
        }
        await set(moviesRef, seedMap);
      } catch (seedErr) {
        console.warn("[RealtimeDB] Seeding note:", seedErr);
      }
      return defaultList;
    }
  } catch (rtdbErr) {
    console.warn("[RealtimeDB] Reading note:", rtdbErr);
  }

  // 2. Try Firestore fallback
  try {
    const q = query(
      collection(db, MOVIES_COLLECTION),
      where("status", "==", "published"),
      orderBy("created_at", "desc"),
      limit(limitCount),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MovieMetadata, "id">) }));
    }
  } catch (err) {
    console.warn("[Firestore] Error reading movies collection, fallback active:", err);
  }

  return defaultList;
}

/**
 * Fetch a single movie metadata document by ID.
 */
export async function getMovieMetadataById(id: string): Promise<MovieMetadata | null> {
  if (!isFirebaseConfigured()) {
    const found = SEED_HORROR_MOVIES.find((m) => m.id === id);
    if (!found) return null;
    return {
      id: found.id,
      title: found.title || "Untitled Horror",
      year: found.year ?? 2024,
      genre: found.genre ?? "Horror",
      overview: found.caption,
      posterUrl: resolveMediaUrl("posters", found.poster_path),
      streamUrl: found.stream_url || resolveMediaUrl("videos", found.media_path),
      durationSeconds: found.duration_seconds,
      quality: "1080p",
      rating: 4.8,
      status: found.status,
      approval_status: found.approval_status,
      created_at: found.created_at,
      source: found.source,
    };
  }

  // 1. Try Realtime Database
  try {
    const itemRef = ref(rtdb, `movies/${id}`);
    const snap = await get(itemRef);
    if (snap.exists()) {
      return snap.val() as MovieMetadata;
    }
  } catch (rtdbErr) {
    console.warn(`[RealtimeDB] Movie ${id} read note:`, rtdbErr);
  }

  // 2. Try Firestore
  try {
    const docRef = doc(db, MOVIES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<MovieMetadata, "id">) };
    }
  } catch (err) {
    console.warn(`[Firestore] Error fetching movie ${id}:`, err);
  }

  // 3. Static fallback
  const fallback = SEED_HORROR_MOVIES.find((m) => m.id === id);
  if (!fallback) return null;
  return {
    id: fallback.id,
    title: fallback.title || "Untitled Horror",
    year: fallback.year ?? 2024,
    genre: fallback.genre ?? "Horror",
    overview: fallback.caption,
    posterUrl: resolveMediaUrl("posters", fallback.poster_path),
    streamUrl: fallback.stream_url || resolveMediaUrl("videos", fallback.media_path),
    durationSeconds: fallback.duration_seconds,
    quality: "1080p",
    rating: 4.8,
    status: fallback.status,
    approval_status: fallback.approval_status,
    created_at: fallback.created_at,
    source: fallback.source,
  };
}

/**
 * Save or update movie metadata in Realtime Database & Firestore.
 */
export async function saveMovieMetadata(movie: MovieMetadata): Promise<void> {
  if (!isFirebaseConfigured()) {
    console.log("[Firebase] Local save:", movie.title);
    return;
  }
  try {
    await set(ref(rtdb, `movies/${movie.id}`), movie);
  } catch (err) {
    console.warn("[RealtimeDB] Save movie note:", err);
  }
  try {
    const docRef = doc(db, MOVIES_COLLECTION, movie.id);
    await setDoc(docRef, movie, { merge: true });
  } catch {
    // optional Firestore fallback
  }
}

/**
 * Delete movie metadata document in Realtime Database & Firestore.
 */
export async function deleteMovieMetadata(id: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    console.log("[Firebase] Local delete:", id);
    return;
  }
  try {
    await remove(ref(rtdb, `movies/${id}`));
  } catch (err) {
    console.warn("[RealtimeDB] Delete movie note:", err);
  }
  try {
    const docRef = doc(db, MOVIES_COLLECTION, id);
    await deleteDoc(docRef);
  } catch {
    // optional Firestore fallback
  }
}
