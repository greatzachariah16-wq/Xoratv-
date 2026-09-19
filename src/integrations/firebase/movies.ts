import { ref, get, set, remove } from "firebase/database";
import { rtdb, isFirebaseConfigured } from "./config";
import type { MovieMetadata, PostRecord } from "./types";
import { resolveMediaUrl } from "@/lib/media";

/**
 * Initial catalogue of full-length horror movies with Render / streaming URLs.
 * Ensures instant, smooth playback and metadata rendering as fallback when RTDB is empty AND Firebase is not configured.
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
    source: "render",
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
    source: "render",
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
    source: "render",
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
    source: "render",
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
    source: "render",
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
    source: "render",
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
 * Fetch movie metadata list from RTDB. Does NOT auto-seed mock movies.
 */
export async function getMoviesMetadata(limitCount = 50): Promise<MovieMetadata[]> {
  if (!isFirebaseConfigured()) {
    return [];
  }

  // Fetch from Firebase Realtime Database
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
    }
    return [];
  } catch (rtdbErr) {
    console.warn("[RealtimeDB] Reading note:", rtdbErr);
    return [];
  }
}

/**
 * Fetch a single movie metadata document by ID from Realtime Database.
 */
export async function getMovieMetadataById(id: string): Promise<MovieMetadata | null> {
  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    const itemRef = ref(rtdb, `movies/${id}`);
    const snap = await get(itemRef);
    if (snap.exists()) {
      return snap.val() as MovieMetadata;
    }
  } catch (rtdbErr) {
    console.warn(`[RealtimeDB] Movie ${id} read note:`, rtdbErr);
  }

  return null;
}

/**
 * Save or update movie metadata in Realtime Database.
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
}

/**
 * Delete movie metadata document in Realtime Database.
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
}
