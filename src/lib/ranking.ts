import type { FeedType, PostRecord, UserSignals } from "@/integrations/firebase/types";

// ==========================================
// 1. NAMED TUNING CONSTANTS (CENTRALIZED)
// ==========================================

export const BUCKET_TARGET_SHARES = {
  HOME: {
    FOLLOWING_ENGAGED: 0.3,
    POPULAR: 0.25,
    FRESH: 0.15,
    DISCOVERY: 0.15,
    EXPLORE: 0.15,
  },
  COLD_START: {
    FOLLOWING_ENGAGED: 0.15,
    POPULAR: 0.35,
    FRESH: 0.2,
    DISCOVERY: 0.15,
    EXPLORE: 0.15,
  },
} as const;

export const SCORING_WEIGHTS = {
  FOLLOWING_BOOST: 25,
  FEATURED_BOOST: 12,
  QUALITY_SCORE_SCALE: 0.2,
  RECOMMENDATION_SCORE_SCALE: 0.3,
  ENGAGEMENT_LOG_BASE: 5.0,
  GENRE_AFFINITY_SCALE: 2.0,
  AUTHOR_AFFINITY_SCALE: 3.0,
  RECENCY_HALF_LIFE_HOURS: 48,
  EXPLORATION_NOISE_AMPLITUDE: 6.0,
  NOT_INTERESTED_PENALTY: -100,
  ALREADY_SHOWN_PENALTY: -20,
  SAME_AUTHOR_STREAK_PENALTY: -30,
  MAX_SAME_AUTHOR_WINDOW: 2,
  STREAK_WINDOW_SIZE: 10,
  COLD_START_SIGNAL_THRESHOLD: 3,
} as const;

// ==========================================
// 2. DETERMINISTIC PRNG (MULBERRY32 + FNV-1A)
// ==========================================

/**
 * FNV-1a 32-bit string hash. Fast, reproducible, non-cryptographic.
 */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG generator seeded with a 32-bit integer.
 * Produces deterministic pseudo-random float in range [0, 1).
 */
function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function random() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get or initialize persistent visit session ID from sessionStorage.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return "ssr_session";
  }
  try {
    let sid = sessionStorage.getItem("xora_session_id");
    if (!sid) {
      sid = `s_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
      sessionStorage.setItem("xora_session_id", sid);
    }
    return sid;
  } catch {
    return "session_fallback";
  }
}

// ==========================================
// 3. TYPES
// ==========================================

export type RankContext = {
  userId: string | null;
  sessionId: string;
  follows: string[]; // author ids
  likedPostIds?: string[];
  signals?: UserSignals;
  feed: FeedType;
  alreadyShownIds?: Set<string> | string[];
};

type ScoredCandidate = {
  post: PostRecord;
  score: number;
  bucket: "FOLLOWING_ENGAGED" | "POPULAR" | "FRESH" | "DISCOVERY" | "EXPLORE";
};

// ==========================================
// 4. CORE SCORING & RANKING PIPELINE
// ==========================================

/**
 * Calculate post candidate score using purely normalized fields and user signals.
 * PROVIDER-AGNOSTIC: Never special-cases vendor strings.
 */
function scorePost(
  post: PostRecord,
  ctx: RankContext,
  likedAuthors: Set<string>,
  alreadyShown: Set<string>,
  rng: () => number,
): number {
  let score = 0;

  // 1. Following boost
  if (post.author_id && ctx.follows.includes(post.author_id)) {
    score += SCORING_WEIGHTS.FOLLOWING_BOOST;
  }

  // 2. Engagement proxy score (log-scaled)
  const proxyLikes =
    (post as unknown as { like_count?: number })?.like_count ?? (post.featured ? 10 : 2);
  const proxyComments =
    (post as unknown as { comment_count?: number })?.comment_count ?? (post.featured ? 3 : 0);
  const rawEngagement = Math.max(0, proxyLikes + proxyComments * 2);
  const engagementScore = Math.log1p(rawEngagement) * SCORING_WEIGHTS.ENGAGEMENT_LOG_BASE;
  score += engagementScore;

  // 3. Recency decay (exponential half-life)
  const rawDate = post.created_at || post.discovered_at;
  const parsedDate = rawDate ? new Date(rawDate).getTime() : Date.now() - 3600000 * 24 * 7;
  const postDate =
    Number.isNaN(parsedDate) || parsedDate <= 0 ? Date.now() - 3600000 * 24 * 7 : parsedDate;
  const ageHours = Math.max(0, (Date.now() - postDate) / (1000 * 60 * 60));
  const recencyFactor = Math.pow(0.5, ageHours / SCORING_WEIGHTS.RECENCY_HALF_LIFE_HOURS);
  score += recencyFactor * 15;

  // 4. Ingestion / Quality / Recommendation scores
  const recScore = post.recommendation_score ?? 50;
  const qualScore = post.quality_score ?? 50;
  score += recScore * SCORING_WEIGHTS.RECOMMENDATION_SCORE_SCALE;
  score += qualScore * SCORING_WEIGHTS.QUALITY_SCORE_SCALE;

  // 5. Featured boost (moderate, doesn't overwhelm)
  if (post.featured) {
    score += SCORING_WEIGHTS.FEATURED_BOOST;
  }

  // 6. User Genre and Author Affinities
  if (ctx.signals) {
    if (post.genre && ctx.signals.genres && ctx.signals.genres[post.genre]) {
      const genreVal = ctx.signals.genres[post.genre] || 0;
      score += genreVal * SCORING_WEIGHTS.GENRE_AFFINITY_SCALE;
    }
    if (post.author_id && ctx.signals.authors && ctx.signals.authors[post.author_id]) {
      const authorVal = ctx.signals.authors[post.author_id] || 0;
      score += authorVal * SCORING_WEIGHTS.AUTHOR_AFFINITY_SCALE;
    }
  }

  // Author liked before bonus
  if (post.author_id && likedAuthors.has(post.author_id)) {
    score += 8;
  }

  // 7. Penalties
  if (alreadyShown.has(post.id)) {
    score += SCORING_WEIGHTS.ALREADY_SHOWN_PENALTY;
  }

  // 8. Seeded exploration jitter (keeps ordering lively without Math.random)
  const jitter = (rng() - 0.5) * 2 * SCORING_WEIGHTS.EXPLORATION_NOISE_AMPLITUDE;
  score += jitter;

  return score;
}

/**
 * Main entry point: Ranks and mixes posts for a specific user and session.
 */
export function rankPostsForUser(posts: PostRecord[], ctx: RankContext): PostRecord[] {
  if (!posts || posts.length === 0) {
    return [];
  }

  // 1. Compute deterministic seed: hash(userId + utcDate + sessionId)
  const utcDate = new Date().toISOString().slice(0, 10);
  const seedString = `${ctx.userId || "anonymous"}_${utcDate}_${ctx.sessionId || "default"}_${ctx.feed}`;
  const seed = fnv1a(seedString);
  const rng = createMulberry32(seed);

  // 2. Filter: Only published and approved posts, exclude user-hidden items
  const hiddenPosts = ctx.signals?.hiddenPostIds || {};
  const hiddenAuthors = ctx.signals?.hiddenAuthorIds || {};

  const eligiblePosts = posts.filter((p) => {
    if (!p || !p.id) return false;
    // Only published and approved
    if (p.status !== "published" || p.approval_status !== "approved") {
      return false;
    }
    // Respect user hide / not_interested signals
    if (hiddenPosts[p.id]) return false;
    if (p.author_id && hiddenAuthors[p.author_id]) return false;
    return true;
  });

  if (eligiblePosts.length === 0) {
    return [];
  }

  // Fast path if only 1 post
  if (eligiblePosts.length === 1) {
    return eligiblePosts;
  }

  // Prepare lookup sets
  const followsSet = new Set(ctx.follows || []);
  const likedPostsSet = new Set(ctx.likedPostIds || []);
  const alreadyShownSet = new Set(
    Array.isArray(ctx.alreadyShownIds)
      ? ctx.alreadyShownIds
      : ctx.alreadyShownIds instanceof Set
        ? Array.from(ctx.alreadyShownIds)
        : [],
  );

  // Find authors the user has liked before
  const likedAuthors = new Set<string>();
  if (likedPostsSet.size > 0) {
    for (const p of posts) {
      if (p.author_id && likedPostsSet.has(p.id)) {
        likedAuthors.add(p.author_id);
      }
    }
  }

  // Detect Cold Start
  const signalCount = Object.keys(ctx.signals?.genres || {}).length + followsSet.size;
  const isColdStart = signalCount < SCORING_WEIGHTS.COLD_START_SIGNAL_THRESHOLD;
  const shares = isColdStart ? BUCKET_TARGET_SHARES.COLD_START : BUCKET_TARGET_SHARES.HOME;

  // 3. Score all candidates
  const scoredList: ScoredCandidate[] = eligiblePosts.map((post) => {
    const score = scorePost(post, ctx, likedAuthors, alreadyShownSet, rng);

    // Assign to candidate bucket
    let bucket: ScoredCandidate["bucket"] = "EXPLORE";

    const isFollowing = post.author_id ? followsSet.has(post.author_id) : false;
    const hasGenreAffinity = post.genre ? (ctx.signals?.genres?.[post.genre] ?? 0) > 0 : false;
    const hasAuthorAffinity = post.author_id
      ? (ctx.signals?.authors?.[post.author_id] ?? 0) > 0 || likedAuthors.has(post.author_id)
      : false;

    const likesCount = (post as unknown as { like_count?: number })?.like_count ?? 0;
    const rawPostDate = post.created_at || post.discovered_at;
    const postCreatedAtMs = rawPostDate ? new Date(rawPostDate).getTime() : 0;
    const isFresh =
      !Number.isNaN(postCreatedAtMs) &&
      postCreatedAtMs > 0 &&
      Date.now() - postCreatedAtMs < 1000 * 60 * 60 * 24 * 3;

    if (isFollowing || hasGenreAffinity || hasAuthorAffinity) {
      bucket = "FOLLOWING_ENGAGED";
    } else if ((post.recommendation_score ?? 0) >= 60 || likesCount >= 5) {
      bucket = "POPULAR";
    } else if (isFresh) {
      bucket = "FRESH";
    } else if (post.source && post.source !== "creator") {
      bucket = "DISCOVERY";
    } else {
      bucket = "EXPLORE";
    }

    return { post, score, bucket };
  });

  // 4. Partition into buckets and sort within each bucket
  const buckets: Record<ScoredCandidate["bucket"], ScoredCandidate[]> = {
    FOLLOWING_ENGAGED: [],
    POPULAR: [],
    FRESH: [],
    DISCOVERY: [],
    EXPLORE: [],
  };

  for (const item of scoredList) {
    buckets[item.bucket].push(item);
  }

  // Sort each bucket by local score + seeded noise
  for (const key of Object.keys(buckets) as ScoredCandidate["bucket"][]) {
    buckets[key].sort((a, b) => {
      // For shorts, bias toward short duration
      if (ctx.feed === "shorts") {
        const durA = a.post.duration_seconds ?? 60;
        const durB = b.post.duration_seconds ?? 60;
        if (Math.abs(durA - durB) > 30) {
          return durA - durB;
        }
      }
      return b.score - a.score;
    });
  }

  // 5. Weighted Interleaving Merge
  // Target proportion counts
  const totalItems = eligiblePosts.length;
  const result: PostRecord[] = [];
  const selectedIds = new Set<string>();

  // Helper to draw the next candidate from a selected bucket
  const pullNextFromBucket = (bucketKey: ScoredCandidate["bucket"]): PostRecord | null => {
    const list = buckets[bucketKey];
    while (list.length > 0) {
      const candidate = list.shift()!;
      if (!selectedIds.has(candidate.post.id)) {
        selectedIds.add(candidate.post.id);
        return candidate.post;
      }
    }
    return null;
  };

  // Helper to draw from any available bucket if chosen bucket is empty
  const pullNextAny = (): PostRecord | null => {
    const bucketOrder: ScoredCandidate["bucket"][] = [
      "FOLLOWING_ENGAGED",
      "POPULAR",
      "FRESH",
      "DISCOVERY",
      "EXPLORE",
    ];
    for (const b of bucketOrder) {
      const next = pullNextFromBucket(b);
      if (next) return next;
    }
    return null;
  };

  while (result.length < totalItems) {
    // Determine active weights based on remaining items in each bucket
    const weights: { bucket: ScoredCandidate["bucket"]; weight: number }[] = [
      {
        bucket: "FOLLOWING_ENGAGED",
        weight: buckets.FOLLOWING_ENGAGED.length > 0 ? shares.FOLLOWING_ENGAGED : 0,
      },
      { bucket: "POPULAR", weight: buckets.POPULAR.length > 0 ? shares.POPULAR : 0 },
      { bucket: "FRESH", weight: buckets.FRESH.length > 0 ? shares.FRESH : 0 },
      { bucket: "DISCOVERY", weight: buckets.DISCOVERY.length > 0 ? shares.DISCOVERY : 0 },
      { bucket: "EXPLORE", weight: buckets.EXPLORE.length > 0 ? shares.EXPLORE : 0 },
    ];

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    if (totalWeight <= 0) {
      // Drain any leftover
      const fallback = pullNextAny();
      if (fallback) result.push(fallback);
      else break;
      continue;
    }

    // Weighted random selection using seeded PRNG
    const roll = rng() * totalWeight;
    let running = 0;
    let chosenBucket: ScoredCandidate["bucket"] = "EXPLORE";

    for (const w of weights) {
      running += w.weight;
      if (roll <= running) {
        chosenBucket = w.bucket;
        break;
      }
    }

    const nextPost = pullNextFromBucket(chosenBucket) || pullNextAny();
    if (nextPost) {
      result.push(nextPost);
    } else {
      break;
    }
  }

  // 6. Same-Author Streak Penalty & Separation Pass
  // Limit to max 2 posts from the same author in any 10-post rolling window
  const finalSequence: PostRecord[] = [];
  const deferred: PostRecord[] = [];

  for (const post of result) {
    if (!post.author_id) {
      finalSequence.push(post);
      continue;
    }

    // Check occurrences of post.author_id in the last 10 elements of finalSequence
    const windowStart = Math.max(0, finalSequence.length - SCORING_WEIGHTS.STREAK_WINDOW_SIZE);
    const recentWindow = finalSequence.slice(windowStart);
    const authorCount = recentWindow.filter((p) => p.author_id === post.author_id).length;

    if (authorCount >= SCORING_WEIGHTS.MAX_SAME_AUTHOR_WINDOW) {
      // Defer this post to be placed later
      deferred.push(post);
    } else {
      finalSequence.push(post);

      // Check if any deferred post can now be reintroduced
      if (deferred.length > 0) {
        for (let i = 0; i < deferred.length; i++) {
          const cand = deferred[i];
          const candWindow = finalSequence.slice(
            Math.max(0, finalSequence.length - SCORING_WEIGHTS.STREAK_WINDOW_SIZE),
          );
          const candAuthorCount = candWindow.filter((p) => p.author_id === cand.author_id).length;
          if (candAuthorCount < SCORING_WEIGHTS.MAX_SAME_AUTHOR_WINDOW) {
            finalSequence.push(cand);
            deferred.splice(i, 1);
            i--;
          }
        }
      }
    }
  }

  // Append any remaining deferred posts at the end
  if (deferred.length > 0) {
    finalSequence.push(...deferred);
  }

  return finalSequence;
}
