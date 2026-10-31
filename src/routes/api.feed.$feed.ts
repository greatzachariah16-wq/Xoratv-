import { createFileRoute } from "@tanstack/react-router";
import { queryRtdb } from "@/server/xseries-service-account";
import type { PostRecord, FeedType } from "@/integrations/firebase/types";

const ALLOWED_FEEDS = new Set<FeedType>(["home", "shorts", "learn"]);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isVisiblePost(post: unknown, feed: FeedType): post is PostRecord {
  if (!post || typeof post !== "object") return false;
  const value = post as Partial<PostRecord>;
  if (value.feed !== feed || value.status !== "published" || value.approval_status !== "approved") return false;
  if (feed === "shorts") {
    return value.kind === "video" &&
      value.source === "creator" &&
      Boolean(value.stream_url || value.media_path);
  }
  return true;
}

export const Route = createFileRoute("/api/feed/$feed")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const feed = params.feed as FeedType;
        if (!ALLOWED_FEEDS.has(feed)) return json({ ok: false, error: "Unknown feed." }, 404);

        const url = new URL(request.url);
        const offset = Math.max(0, Math.min(10000, Number(url.searchParams.get("offset")) || 0));
        const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit")) || 6));

        try {
          const index = await queryRtdb(`postsByFeed/${feed}`) as Record<string, {
            created_at?: string;
            recommendation_score?: number;
          }> | null;

          let orderedIds: string[] = [];
          if (index && typeof index === "object") {
            orderedIds = Object.entries(index)
              .sort(([, a], [, b]) => {
                const scoreDiff = (Number(b?.recommendation_score) || 0) - (Number(a?.recommendation_score) || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
              })
              .map(([id]) => id);
          } else {
            const all = await queryRtdb("posts") as Record<string, unknown> | null;
            orderedIds = Object.entries(all || {})
              .filter(([, post]) => isVisiblePost(post, feed))
              .sort(([, a], [, b]) => String((b as PostRecord).created_at || "").localeCompare(String((a as PostRecord).created_at || "")))
              .map(([id]) => id);
          }

          // Read full post records from the same Firebase connection used by publishing.
          // Scan past stale index entries so they cannot make a feed look empty or end early.
          const visible: PostRecord[] = [];
          const batchSize = 8;
          for (let start = 0; start < orderedIds.length && visible.length < offset + limit; start += batchSize) {
            const batch = await Promise.all(
              orderedIds.slice(start, start + batchSize).map((id) => queryRtdb(`posts/${id}`)),
            );
            for (const post of batch) {
              if (isVisiblePost(post, feed)) visible.push(post);
            }
          }

          visible.sort((a, b) => {
            if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
            const scoreDiff = (Number(b.recommendation_score) || 0) - (Number(a.recommendation_score) || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
          });

          return json({ ok: true, posts: visible.slice(offset, offset + limit) });
        } catch (error) {
          console.error("[Public feed] Could not load feed:", error);
          return json({ ok: false, error: "Could not load this feed right now." }, 503);
        }
      },
    },
  },
});
